import { VADEngineType } from './types';
import type { VADConfig } from './types';
import { BaseVADEngine } from './base';
import { SileroVADEngine } from './sileroVAD';


export * from './types';
export { BaseVADEngine } from './base';
export { SileroVADEngine } from './sileroVAD';


export const DEFAULT_VAD_CONFIG: 
VADConfig = {
  onsetThreshold: 0.65,
  offsetThreshold: 0.4,
  minEnergyThreshold: 0.03,
  smoothingWindow: 8,
  checkInterval: 100,
};


export function createVADEngine(
  type: VADEngineType,
  config: VADConfig = DEFAULT_VAD_CONFIG
): BaseVADEngine {
  switch (type) {
    case VADEngineType.SILERO:
      return new SileroVADEngine(config);

    case VADEngineType.ENERGY_BASED:
      throw new Error('Energy-based VAD is not implemented');

    default:
      throw new Error(`Unknown VAD engine type: ${type}`);
  }
}

export function createDefaultVAD(engineType: VADEngineType = VADEngineType.SILERO): BaseVADEngine {
  return createVADEngine(engineType, DEFAULT_VAD_CONFIG);
}

