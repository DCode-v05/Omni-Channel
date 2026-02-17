import { useState, useRef, useEffect } from 'react';
import { MicrophoneIcon } from './Icons';
import { submitOmni, generateTtsAudio } from '../services/api';
import { createDefaultVAD, VADEngineType, BaseVADEngine } from '../modules/vad';
import { AudioManager } from '../modules/audio';
import { playManagedAudioBlob, stopAudioPlayback } from '../services/audioPlayer';
import { getProsodyFromSentiment } from '../services/ttsEnhancer';

// Web Speech API type declarations
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

declare global {
  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new (): SpeechRecognition;
    };
  }
}

interface VoiceModeProps {
  channel: string;
  user_id?: string;
  session_id?: string;
  onChunkProcessed?: (response: any) => void;
  onError?: (error: string) => void;
}

const VOICE_CONFIG = {
  SILENCE_DURATION: 2000,
  MIN_CHUNK_DURATION: 3000,
  VAD_CHECK_INTERVAL: 100,
  RECORDING_COOLDOWN: 300,
  RESUME_WINDOW: 1500,
} as const;

const BUTTON_STYLES = {
  container: {
    position: 'fixed' as const,
    top: '20px',
    right: '20px',
    zIndex: 1000,
  },
  button: {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    transition: 'all 0.3s ease',
  },
  statusBadge: {
    position: 'absolute' as const,
    top: '70px',
    right: '0',
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: 'white',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    whiteSpace: 'nowrap' as const,
  },
} as const;

export const VoiceMode = ({
  channel,
  user_id,
  session_id,
  onChunkProcessed,
  onError,
}: VoiceModeProps) => {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const vadRef = useRef<BaseVADEngine | null>(null);
  const audioManagerRef = useRef<AudioManager | null>(null);
  const vadProcessorRef = useRef<((analyser: AnalyserNode) => Promise<boolean>) | null>(null);

  const isActiveRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const vadAnimationFrameRef = useRef<number | null>(null);
  const lastVadCheckRef = useRef<number>(0);
  const lastRecordingStopRef = useRef<number>(0);

  const pendingChunkRef = useRef<Blob | null>(null);
  const pendingChunkTimestampRef = useRef<number | null>(null);
  const pendingChunkDurationRef = useRef<number | null>(null);
  const resumeWindowTimerRef = useRef<number | null>(null);
  const consecutiveSilenceCountRef = useRef<number>(0);

  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsSeqRef = useRef(0);
  const ttsPlayingRef = useRef(false);

  // Speech Recognition for intelligent barge-in
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const bargeInActiveRef = useRef(false);
  const lastClassificationRef = useRef<'cooperative' | 'competitive' | 'unknown' | null>(null);

  useEffect(() => {
    return () => stopVoiceMode();
  }, []);

  // Rule-based classifier for interruptions
  const classifyInterruption = (text: string): 'cooperative' | 'competitive' | 'unknown' => {
    const normalized = text.toLowerCase().trim();
    
    const cooperativeKeywords = [
      'uh-huh', 'uh huh', 'yes', 'okay', 'ok', 'alright', 'all right', 'right',
      'got it', 'mm-hmm', 'mhm', 'sure', 'yeah', 'yep', 'continue', 'go on',
      'keep going', 'i see', 'understood', 'gotcha', 'mhm', 'uhm', 'hmm'
    ];
    
    const competitiveKeywords = [
      'stop', 'wait', 'hold on', 'no', "that's wrong", 'actually', 'but',
      'however', 'i disagree', "that's not right", 'cancel', 'never mind',
      'wrong', 'incorrect', 'pause', 'halt', 'nope', 'nah', 'not really'
    ];
    
    // Check for competitive keywords first (higher priority)
    for (const keyword of competitiveKeywords) {
      if (normalized.includes(keyword)) {
        console.log(`[Barge-In Classification] Text: "${text}" → COMPETITIVE (matched keyword: "${keyword}")`);
        return 'competitive';
      }
    }
    
    // Check for cooperative keywords
    for (const keyword of cooperativeKeywords) {
      if (normalized.includes(keyword)) {
        console.log(`[Barge-In Classification] Text: "${text}" → COOPERATIVE (matched keyword: "${keyword}")`);
        return 'cooperative';
      }
    }
    
    console.log(`[Barge-In Classification] Text: "${text}" → UNKNOWN (no keyword match)`);
    return 'unknown';
  };

  const startRecording = () => {
    const audioManager = audioManagerRef.current;
    if (!audioManager) return;

    const now = Date.now();
    if (now - lastRecordingStopRef.current < VOICE_CONFIG.RECORDING_COOLDOWN) {
      return;
    }

    if (audioManager.isRecording() || audioManager.isProcessing()) {
      return;
    }

    if (vadRef.current) {
      vadRef.current.reset();
    }

    audioManager.clearChunks();
    audioManager.startRecording(
      undefined,
      () => {
        processChunk(false);
      }
    );
    lastRecordingStopRef.current = 0;
  };

  const stopRecording = () => {
    const audioManager = audioManagerRef.current;
    if (!audioManager) return;

    if (audioManager.isRecording()) {
      audioManager.stopRecording();
      lastRecordingStopRef.current = Date.now();
    }
  };

  // Get Web Speech Recognition instance with browser compatibility
  const getSpeechRecognition = (): SpeechRecognition | null => {
    if (typeof window === 'undefined') return null;
    
    const SpeechRecognitionClass = 
      window.SpeechRecognition || 
      (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognitionClass) {
      console.warn('Web Speech API not supported in this browser');
      return null;
    }
    
    return new SpeechRecognitionClass();
  };

  // Stop barge-in recognition
  const stopBargeInRecognition = () => {
    if (bargeInActiveRef.current) {
      console.log('[Barge-In] Stopping barge-in recognition');
    }
    const recognition = speechRecognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch (e) {
        // Recognition might already be stopped
      }
      speechRecognitionRef.current = null;
    }
    bargeInActiveRef.current = false;
    lastClassificationRef.current = null;
  };

  // Start barge-in recognition when TTS is playing and user interrupts
  const startBargeInRecognition = () => {
    // Don't start if already active or TTS not playing
    if (bargeInActiveRef.current || !ttsPlayingRef.current) {
      return;
    }

    console.log('[Barge-In] Starting intelligent barge-in recognition (TTS is playing, user interrupted)');

    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      console.warn('[Barge-In] Web Speech API not available, falling back to immediate stop');
      // Fallback: stop TTS immediately
      ttsAbortRef.current?.abort();
      stopAudioPlayback();
      ttsPlayingRef.current = false;
      return;
    }

    const recognition = Recognition;
    speechRecognitionRef.current = recognition;
    bargeInActiveRef.current = true;
    lastClassificationRef.current = null;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    // Handle interim results (faster response)
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      // Process interim results for faster classification
      if (interimTranscript) {
        console.log(`[Barge-In] Interim transcript received: "${interimTranscript}"`);
        const classification = classifyInterruption(interimTranscript);
        if (classification === 'competitive') {
          console.log('[Barge-In] ⛔ COMPETITIVE interruption detected (interim) - Stopping TTS immediately');
          // Stop TTS immediately on competitive interruption
          ttsAbortRef.current?.abort();
          stopAudioPlayback();
          ttsPlayingRef.current = false;
          stopBargeInRecognition();
          return;
        }
        lastClassificationRef.current = classification;
      }

      // Process final results
      if (finalTranscript) {
        console.log(`[Barge-In] Final transcript received: "${finalTranscript.trim()}"`);
        const classification = classifyInterruption(finalTranscript);
        if (classification === 'competitive') {
          console.log('[Barge-In] ⛔ COMPETITIVE interruption detected (final) - Stopping TTS');
          // Stop TTS on competitive interruption
          ttsAbortRef.current?.abort();
          stopAudioPlayback();
          ttsPlayingRef.current = false;
          stopBargeInRecognition();
        } else if (classification === 'cooperative') {
          console.log('[Barge-In] ✅ COOPERATIVE interruption detected (final) - Continuing TTS playback');
          // Continue TTS, stop recognition
          stopBargeInRecognition();
        } else {
          console.log('[Barge-In] ❓ UNKNOWN interruption (final) - Keeping recognition active');
        }
        // If unknown, keep listening
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      // On error, fallback to immediate stop
      if (ttsPlayingRef.current) {
        ttsAbortRef.current?.abort();
        stopAudioPlayback();
        ttsPlayingRef.current = false;
      }
      stopBargeInRecognition();
    };

    recognition.onend = () => {
      // If recognition ends and TTS is still playing, it means it was cooperative or unknown
      // Reset the ref but don't stop TTS
      speechRecognitionRef.current = null;
      bargeInActiveRef.current = false;
    };

    try {
      recognition.start();
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      // Fallback: stop TTS immediately
      if (ttsPlayingRef.current) {
        ttsAbortRef.current?.abort();
        stopAudioPlayback();
        ttsPlayingRef.current = false;
      }
      stopBargeInRecognition();
    }
  };

const monitorVoiceActivity = () => {
  const audioManager = audioManagerRef.current;
  const vadProcessor = vadProcessorRef.current;
  
  if (!audioManager || !vadProcessor) {
    console.error('VoiceMode: Missing audioManager or vadProcessor');
    return;
  }

  const checkVoice = async () => {
    if (!isActiveRef.current) {
      vadAnimationFrameRef.current = null;
      return;
    }

    const now = Date.now();
    if (now - lastVadCheckRef.current < VOICE_CONFIG.VAD_CHECK_INTERVAL) {
      vadAnimationFrameRef.current = requestAnimationFrame(checkVoice);
      return;
    }
    lastVadCheckRef.current = now;

    try {
      const analyser = audioManager.getAnalyser();
      const hasVoice = await vadProcessor(analyser);

      if (hasVoice) {
        setIsListening(true);

        // Intelligent barge-in: use speech recognition to classify interruption
        if (ttsPlayingRef.current && !bargeInActiveRef.current) {
          console.log('[Barge-In] Voice detected during TTS playback - Starting classification');
          startBargeInRecognition();
        }
        
        if (pendingChunkRef.current && pendingChunkTimestampRef.current) {
          const timeSinceLastChunk = Date.now() - pendingChunkTimestampRef.current;
          if (timeSinceLastChunk < VOICE_CONFIG.RESUME_WINDOW) {
            console.log('Speech resumed, canceling pending chunk send');
            pendingChunkRef.current = null;
            pendingChunkTimestampRef.current = null;
            pendingChunkDurationRef.current = null;
            if (resumeWindowTimerRef.current) {
              clearTimeout(resumeWindowTimerRef.current);
              resumeWindowTimerRef.current = null;
            }
          }
        }
        
        if (!audioManager.isRecording() && !audioManager.isProcessing()) {
          startRecording();
        }
        
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        
        consecutiveSilenceCountRef.current = 0;
      } else {
        setIsListening(false);
        
        if (pendingChunkRef.current && pendingChunkTimestampRef.current) {
          const timeSinceLastChunk = Date.now() - pendingChunkTimestampRef.current;
          if (timeSinceLastChunk < VOICE_CONFIG.RESUME_WINDOW && !audioManager.isRecording()) {
            vadAnimationFrameRef.current = requestAnimationFrame(checkVoice);
            return;
          }
        }
        
        if (audioManager.isRecording() && !silenceTimerRef.current) {
          consecutiveSilenceCountRef.current++;
          const requiredConsecutiveSilence = 5;
          
          if (consecutiveSilenceCountRef.current < requiredConsecutiveSilence) {
            vadAnimationFrameRef.current = requestAnimationFrame(checkVoice);
            return;
          }
          
          consecutiveSilenceCountRef.current = 0;
          silenceTimerRef.current = window.setTimeout(() => {
            const chunks = audioManager.getChunks();
            if (chunks.length > 0) {
              const audioBlob = new Blob(chunks, { type: 'audio/webm' });
              const duration = audioManager.getDuration();
              
              pendingChunkRef.current = audioBlob;
              pendingChunkTimestampRef.current = Date.now();
              pendingChunkDurationRef.current = duration;
              
              resumeWindowTimerRef.current = window.setTimeout(() => {
                if (pendingChunkRef.current && pendingChunkTimestampRef.current) {
                  processPendingChunk();
                }
                resumeWindowTimerRef.current = null;
              }, VOICE_CONFIG.RESUME_WINDOW);
            }
            
            stopRecording();
            silenceTimerRef.current = null;
          }, VOICE_CONFIG.SILENCE_DURATION);
        }
      }
    } catch (error) {
      console.error('VAD check error:', error);
    }

    vadAnimationFrameRef.current = requestAnimationFrame(checkVoice);
  };

  checkVoice();
};

const getPrimaryResponse = (
    response: any
  ): { text: string; sentiment?: any } | null => {
    if (!response) return null;

    const inputId: string | undefined = response.input_id;

    const bucketId =
      inputId && Array.isArray(response.clusters)
        ? response.clusters.find((c: any) => {
            const items = c?.items;
            if (!Array.isArray(items)) return false;
            return items.some(
              (it: any) => it?.original_data?.gateway_output?.input_id === inputId
            );
          })?.bucket_id
        : undefined;

    const picked =
      (bucketId !== undefined && Array.isArray(response.responses)
        ? response.responses.find((r: any) => r?.bucket_id === bucketId)
        : null) ||
      (Array.isArray(response.responses) && response.responses.length > 0
        ? response.responses[response.responses.length - 1]
        : null) ||
      null;

    const text: unknown = picked?.llm_response ?? response.llm_response;
    if (typeof text !== 'string' || !text.trim()) return null;

    return { text, sentiment: picked?.sentiment ?? response.sentiment };
  };

  const speakResponseIfAvailable = async (response: any) => {
    const picked = getPrimaryResponse(response);
    if (!picked) return;

    ttsAbortRef.current?.abort();
    stopAudioPlayback();

    const mySeq = ++ttsSeqRef.current;
    const controller = new AbortController();
    ttsAbortRef.current = controller;

    try {
      const sentiment = picked.sentiment;
      const prosodySettings = sentiment
        ? getProsodyFromSentiment(sentiment)
        : undefined;

      ttsPlayingRef.current = true;

      const audioBlob = await generateTtsAudio(picked.text, prosodySettings, {
        signal: controller.signal,
      });

      if (mySeq !== ttsSeqRef.current) return;

      await playManagedAudioBlob(audioBlob, {
        signal: controller.signal,
        onEnd: () => {
          ttsPlayingRef.current = false;
          // Stop barge-in recognition when TTS ends naturally
          stopBargeInRecognition();
        },
      });
    } catch (err: any) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Stop barge-in recognition when TTS is aborted
        stopBargeInRecognition();
        return;
      }

      console.error('TTS playback failed:', err);
      onError?.(err instanceof Error ? err.message : 'Failed to play TTS audio');
    } finally {
      if (mySeq === ttsSeqRef.current) {
        ttsPlayingRef.current = false;
        stopBargeInRecognition();
      }
    }
  };

  const processPendingChunk = async () => {
    if (!pendingChunkRef.current) return;
    
    const audioManager = audioManagerRef.current;
    if (!audioManager || audioManager.isProcessing()) {
      return;
    }

    const duration = pendingChunkDurationRef.current || 0;
    if (duration < VOICE_CONFIG.MIN_CHUNK_DURATION) {
      pendingChunkRef.current = null;
      pendingChunkTimestampRef.current = null;
      pendingChunkDurationRef.current = null;
      return;
    }

    audioManager.setProcessing(true);

    try {
      const audioFile = new File(
        [pendingChunkRef.current], 
        `chunk_${Date.now()}.webm`,
        { type: 'audio/webm' }
      );

      const response = await submitOmni({
        channel,
        audio: audioFile,
        user_id,
        session_id,
      });

      onChunkProcessed?.(response);
      speakResponseIfAvailable(response);

      if (vadRef.current) {
        vadRef.current.reset();
      }
    } catch (error) {
      console.error('Error processing chunk:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to process audio chunk');
    } finally {
      audioManager.setProcessing(false);
      pendingChunkRef.current = null;
      pendingChunkTimestampRef.current = null;
      pendingChunkDurationRef.current = null;
      if (!isActiveRef.current) {
        cleanup();
      }
    }
  };

  const processChunk = async (forceProcess = false) => {
    const audioManager = audioManagerRef.current;
    if (!audioManager || audioManager.isProcessing()) {
      return;
    }

    if (pendingChunkRef.current) {
      audioManager.clearChunks();
      return;
    }

    const chunks = audioManager.getChunks();
    if (chunks.length === 0) {
      return;
    }    
  
    const duration = audioManager.getDuration();
    if (!forceProcess && duration < VOICE_CONFIG.MIN_CHUNK_DURATION) {
      audioManager.clearChunks();
      return;
    }
  
    audioManager.setProcessing(true);
  
    try {
      const audioFile = audioManager.createAudioFile(`chunk_${Date.now()}.webm`);
      if (!audioFile) {
        throw new Error('Failed to create audio file');
      }
  
      const response = await submitOmni({
        channel,
        audio: audioFile,
        user_id,
        session_id,
      });
  
      onChunkProcessed?.(response);
      speakResponseIfAvailable(response);
  
      if (vadRef.current) {
        vadRef.current.reset();
      }
      audioManager.clearChunks();
    } catch (error) {
      console.error('Error processing chunk:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to process audio chunk');
      audioManager.clearChunks();
    } finally {
      audioManager.setProcessing(false);
      if (!isActiveRef.current) {
        cleanup();
      }
    }
  };

  const startVoiceMode = async () => {
    try {
      const audioManager = new AudioManager({
        timeslice: 100,
        fftSize: 2048,
        smoothing: 0.3,
      });
      
      const resources = await audioManager.initialize();
      audioManagerRef.current = audioManager;
  
      const vad = createDefaultVAD(VADEngineType.SILERO);
      await vad.load();
      vadRef.current = vad;
  
      vadProcessorRef.current = vad.createStreamProcessor(resources.audioContext, resources.source);
  
      vad.reset();
  
      isActiveRef.current = true;
      setIsActive(true);
      setIsListening(false);
      
      monitorVoiceActivity();
    } catch (error) {
      console.error('Failed to start voice mode:', error);
      onError?.('Failed to access microphone. Please check permissions.');
      isActiveRef.current = false;
      setIsActive(false);
      cleanup();
    }
  };

  const stopVoiceMode = () => {
    isActiveRef.current = false;
    setIsActive(false);

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (resumeWindowTimerRef.current) {
      clearTimeout(resumeWindowTimerRef.current);
      resumeWindowTimerRef.current = null;
    }

    if (vadAnimationFrameRef.current) {
      cancelAnimationFrame(vadAnimationFrameRef.current);
      vadAnimationFrameRef.current = null;
    }

    const audioManager = audioManagerRef.current;
    if (audioManager?.isRecording()) {
      const wasProcessing = audioManager.isProcessing();
      if (!wasProcessing) {
        audioManager.stopRecording();
        processChunk();
        return;
      }
    }

    if (pendingChunkRef.current) {
      processPendingChunk();
      return;
    }

    cleanup();
  };

  const cleanup = () => {
    if (resumeWindowTimerRef.current) {
      clearTimeout(resumeWindowTimerRef.current);
      resumeWindowTimerRef.current = null;
    }
    pendingChunkRef.current = null;
    pendingChunkTimestampRef.current = null;
    pendingChunkDurationRef.current = null;

    // Stop barge-in recognition on cleanup
    stopBargeInRecognition();

    if (vadRef.current) {
      vadRef.current.dispose();
      vadRef.current = null;
    }

    if (audioManagerRef.current) {
      audioManagerRef.current.dispose();
      audioManagerRef.current = null;
    }

    vadProcessorRef.current = null;
    setIsListening(false);
  };

  const toggleVoiceMode = () => {
    isActive ? stopVoiceMode() : startVoiceMode();
  };

  const getButtonColor = () => {
    if (!isActive) return '#4CAF50';
    return isListening ? '#ff4444' : '#ff8888';
  };

  return (
    <div className="voice-mode-container" style={BUTTON_STYLES.container}>
      <button
        type="button"
        onClick={toggleVoiceMode}
        className={`voice-mode-toggle ${isActive ? 'active' : ''}`}
        style={{ ...BUTTON_STYLES.button, backgroundColor: getButtonColor() }}
        title={isActive ? 'Stop voice mode' : 'Start voice mode'}
      >
        <MicrophoneIcon className="icon" />
      </button>
      
      {isActive && (
        <div style={BUTTON_STYLES.statusBadge}>
          {isListening ? '🎤 Listening...' : '⏸️ Paused'}
        </div>
      )}
    </div>
  );
};
