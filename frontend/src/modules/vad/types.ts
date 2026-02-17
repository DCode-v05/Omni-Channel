export interface VADResult {
  probability: number;
  isSpeech: boolean;
  confidence: number;
  timestamp: number;
  type: 'onset' | 'offset' | 'continuing' | 'silence';
}

export interface VADConfig {
  onsetThreshold: number;
  offsetThreshold: number;
  minEnergyThreshold?: number;
  smoothingWindow?: number;
  checkInterval?: number;
}

export interface VADStreamProcessor {
  (analyser: AnalyserNode): Promise<boolean>;
}

export const VADEngineType = {
  SILERO: 'silero',
  WEBRTC: 'webrtc',
  PICOVOICE: 'picovoice',
  ENERGY_BASED: 'energy',
} as const;

export type VADEngineType = typeof VADEngineType[keyof typeof VADEngineType];

