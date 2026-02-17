import { useState, useRef, useEffect } from 'react';
import { MicrophoneIcon } from './Icons';

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  onRecordingCancel: () => void;
}

export const AudioRecorder = ({ onRecordingComplete, onRecordingCancel }: AudioRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const isCancelingRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setHasPermission(true);
      return true;
    } catch (error) {
      console.error('Error requesting microphone permission:', error);
      setHasPermission(false);
      return false;
    }
  };

  const startRecording = async () => {
    try {
      if (hasPermission === false) {
        alert('Microphone permission denied. Please enable microphone access in your browser settings.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') 
          ? 'audio/webm' 
          : MediaRecorder.isTypeSupported('audio/mp4') 
          ? 'audio/mp4'
          : 'audio/webm',
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      isCancelingRef.current = false;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (!isCancelingRef.current) {
          const audioBlob = new Blob(audioChunksRef.current, { 
            type: mediaRecorder.mimeType || 'audio/webm' 
          });
          onRecordingComplete(audioBlob);
          setIsRecording(false);
          setRecordingTime(0);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      intervalRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      setHasPermission(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Failed to access microphone. Please check your permissions.');
      setHasPermission(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  };

  const cancelRecording = () => {
    isCancelingRef.current = true;
    
    if (mediaRecorderRef.current && isRecording) {
      audioChunksRef.current = [];
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRecording(false);
    setRecordingTime(0);
    onRecordingCancel();
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isRecording) {
    return (
      <button
        type="button"
        onClick={async () => {
          if (hasPermission === null) {
            const granted = await requestMicrophonePermission();
            if (granted) {
              startRecording();
            }
          } else {
            startRecording();
          }
        }}
        className="microphone-icon-button"
        title="Record audio"
      >
        <MicrophoneIcon className="icon" />
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={stopRecording}
        className="microphone-icon-button recording"
        title="Stop recording"
      >
        <MicrophoneIcon className="icon" />
      </button>
      <div className="recording-indicator-overlay">
        <div className="recording-dot"></div>
        <span className="recording-time">{formatTime(recordingTime)}</span>
        <button
          type="button"
          onClick={cancelRecording}
          className="cancel-recording-button"
          title="Cancel recording"
        >
          Cancel
        </button>
      </div>
    </>
  );
};
