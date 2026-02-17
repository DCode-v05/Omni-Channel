export interface RecordingState {
  isRecording: boolean;
  isProcessing: boolean;
  startTime: number | null;
  chunks: Blob[];
}

export interface AudioManagerConfig {
  timeslice?: number;
  fftSize?: number;
  smoothing?: number;
}

export interface AudioResources {
  stream: MediaStream;
  audioContext: AudioContext;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
}

