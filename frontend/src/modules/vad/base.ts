import type { VADResult, VADConfig, VADStreamProcessor } from './types';

export abstract class BaseVADEngine {
  protected config: VADConfig;
  protected isLoaded: boolean = false;

  constructor(config: VADConfig) {
    this.config = this.validateConfig(config);
  }

  protected validateConfig(config: VADConfig): VADConfig {
    return {
      onsetThreshold: Math.max(0.3, Math.min(0.7, config.onsetThreshold)),
      offsetThreshold: Math.max(0.2, Math.min(0.5, config.offsetThreshold)),
      minEnergyThreshold: config.minEnergyThreshold ?? 0.01,
      smoothingWindow: config.smoothingWindow ?? 5,
      checkInterval: config.checkInterval ?? 100,
    };
  }


  abstract load(): Promise<void>;


  abstract detect(audioBuffer: AudioBuffer): Promise<VADResult>;

  abstract createStreamProcessor(
    audioContext: AudioContext,
    source: MediaStreamAudioSourceNode
  ): VADStreamProcessor;


  abstract reset(): void;

 
  abstract dispose(): void;

  updateConfig(newConfig: Partial<VADConfig>): void {
    this.config = this.validateConfig({
      ...this.config,
      ...newConfig,
    });
  }


  getConfig(): VADConfig {
    return { ...this.config };
  }
  
  get loaded(): boolean {
    return this.isLoaded;
  }
}

