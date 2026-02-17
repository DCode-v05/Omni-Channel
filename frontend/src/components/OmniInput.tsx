import { useState } from 'react';
import { TextInput } from './TextInput';
import { AttachmentButton, FilePreview } from './AttachmentButton';
import { AudioRecorder } from './AudioRecorder';
import { SendIcon } from './Icons';
import { submitOmni, generateTtsAudio } from '../services/api';
import { playAudioBlob } from '../services/audioPlayer';

interface OmniInputProps {
  channel: string;
  user_id?: string;
  session_id?: string;
  onResponse?: (response: any) => void;
  onError?: (error: string) => void;
}

export const OmniInput = ({
  channel,
  user_id,
  session_id,
  onResponse,
  onError,
}: OmniInputProps) => {
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (isSubmitting) return;
  
    const hasText = text.trim().length > 0;
    const hasFile = selectedFile !== null;
    const hasAudio = audioBlob !== null;
  
    if (!hasText && !hasFile && !hasAudio) {
      onError?.('Please enter text, attach a file, or record audio');
      return;
    }
  
    setIsSubmitting(true);
  
    try {
      let audioFile: File | undefined;
      if (hasAudio && audioBlob) {
        audioFile = new File([audioBlob], 'recording.webm', {
          type: audioBlob.type || 'audio/webm',
        });
      }
  
      let imageFile: File | undefined;
      let documentFile: File | undefined;
      if (hasFile && selectedFile) {
        const imageTypes = ['image/png', 'image/jpeg', 'image/jpg'];
        if (imageTypes.includes(selectedFile.type)) {
          imageFile = selectedFile;
        } else {
          documentFile = selectedFile;
        }
      }
  
      const response = await submitOmni({
        channel,
        text: hasText ? text.trim() : undefined,
        audio: audioFile,
        document: documentFile,
        image: imageFile,
        user_id,
        session_id,
      });
  
      if (hasAudio) {
        try {
          let textForTts: string | null = null;

          if (Array.isArray(response.responses) && response.responses.length > 0) {
            const lastResponse = response.responses[response.responses.length - 1];
            if (lastResponse && typeof lastResponse.llm_response === 'string') {
              textForTts = lastResponse.llm_response;
            } else {
              const first = response.responses[0];
              if (first && typeof first.llm_response === 'string') {
                textForTts = first.llm_response;
              }
            }
          }

          if (textForTts) {
            const ttsBlob = await generateTtsAudio(textForTts);
            await playAudioBlob(ttsBlob);
          }
        } catch (err) {
          console.error('TTS playback failed:', err);
          const msg =
            err instanceof Error ? err.message : 'Failed to play TTS audio';
          onError?.(msg);
        }
      }

      setText('');
      setSelectedFile(null);
      setAudioBlob(null);
      onResponse?.(response);
    } catch (error) {
      console.error('Submission error:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to submit. Please try again.';
      onError?.(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSubmit = !isSubmitting && (text.trim() || selectedFile || audioBlob);
  const showSendButton = text.trim().length > 0 || selectedFile || audioBlob;

  return (
    <div className="omni-input-wrapper">
      {(selectedFile || audioBlob) && (
        <div className="preview-area">
          {selectedFile && (
            <FilePreview file={selectedFile} onRemove={() => setSelectedFile(null)} />
          )}
          {audioBlob && (
            <div className="audio-preview-chip">
              <span className="audio-indicator">🎤 Audio recorded</span>
              <button
                type="button"
                onClick={() => setAudioBlob(null)}
                className="remove-audio-chip-button"
                title="Remove audio"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}
      <div className="omni-input-box">
        <AttachmentButton
          onFileSelect={setSelectedFile}
          selectedFile={selectedFile}
        />
        <TextInput
          value={text}
          onChange={setText}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
        />
        <AudioRecorder
          onRecordingComplete={setAudioBlob}
          onRecordingCancel={() => setAudioBlob(null)}
        />
        {showSendButton && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`send-button ${isSubmitting ? 'submitting' : ''}`}
            title="Send message"
          >
            <SendIcon className="icon" />
          </button>
        )}
      </div>
    </div>
  );
};