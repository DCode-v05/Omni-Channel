import type { RecordingState, AudioManagerConfig, AudioResources } from './types';

export class AudioManager {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  
  private state: RecordingState = {
    isRecording: false,
    isProcessing: false,
    startTime: null,
    chunks: [],
  };

  private config: Required<AudioManagerConfig>;
  private onDataAvailable: ((chunk: Blob) => void) | null = null;
  private onStop: (() => void) | null = null;

  constructor(config: AudioManagerConfig = {}) {
    this.config = {
      timeslice: config.timeslice ?? 100,
      fftSize: config.fftSize ?? 2048,
      smoothing: config.smoothing ?? 0.3,
    };
  }

  async initialize(): Promise<AudioResources> {
    if (this.stream && this.audioContext && this.analyser) {
      return {
        stream: this.stream,
        audioContext: this.audioContext,
        analyser: this.analyser,
        source: this.source!,
      };
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.stream = stream;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.audioContext = audioContext;
    
    const source = audioContext.createMediaStreamSource(stream);
    this.source = source;
    
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = this.config.fftSize;
    analyser.smoothingTimeConstant = this.config.smoothing;
    source.connect(analyser);
    this.analyser = analyser;

    return {
      stream,
      audioContext,
      analyser,
      source,
    };
  }

  getAnalyser(): AnalyserNode {
    if (!this.analyser) {
      throw new Error('AudioManager not initialized. Call initialize() first.');
    }
    return this.analyser;
  }

  getAudioContext(): AudioContext {
    if (!this.audioContext) {
      throw new Error('AudioManager not initialized. Call initialize() first.');
    }
    return this.audioContext;
  }

  startRecording(onDataAvailable?: (chunk: Blob) => void, onStop?: () => void): void {
    if (!this.stream) {
      throw new Error('AudioManager not initialized. Call initialize() first.');
    }

    if (this.state.isRecording) {
      console.warn('Recording already in progress');
      return;
    }

    if (this.state.isProcessing) {
      console.warn('Cannot start recording while processing');
      return;
    }

    this.onDataAvailable = onDataAvailable || null;
    this.onStop = onStop || null;

    const mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
    });

    this.mediaRecorder = mediaRecorder;
    this.state.chunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.state.chunks.push(event.data);
        this.onDataAvailable?.(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      this.state.isRecording = false;
      this.onStop?.();
    };

    mediaRecorder.start(this.config.timeslice);
    this.state.isRecording = true;
    this.state.startTime = Date.now();
  }

  stopRecording(): void {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }

  getState(): Readonly<RecordingState> {
    return { ...this.state };
  }

  getDuration(): number {
    if (!this.state.startTime) return 0;
    return Date.now() - this.state.startTime;
  }

  getChunks(): Blob[] {
    return [...this.state.chunks];
  }

  createAudioBlob(): Blob | null {
    if (this.state.chunks.length === 0) return null;
    
    return new Blob(this.state.chunks, { 
      type: this.mediaRecorder?.mimeType || 'audio/webm' 
    });
  }

  createAudioFile(filename?: string): File | null {
    const blob = this.createAudioBlob();
    if (!blob) return null;

    return new File([blob], filename || `recording_${Date.now()}.webm`, {
      type: blob.type || 'audio/webm',
    });
  }

  clearChunks(): void {
    this.state.chunks = [];
    this.state.startTime = null;
  }

  setProcessing(processing: boolean): void {
    this.state.isProcessing = processing;
  }

  isRecording(): boolean {
    return this.state.isRecording;
  }

  isProcessing(): boolean {
    return this.state.isProcessing;
  }

  dispose(): void {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }
    this.stream?.getTracks().forEach(track => track.stop());
    
    this.audioContext?.close();

    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.mediaRecorder = null;
    this.state = {
      isRecording: false,
      isProcessing: false,
      startTime: null,
      chunks: [],
    };
    this.onDataAvailable = null;
    this.onStop = null;
  }
}

export * from './types';
