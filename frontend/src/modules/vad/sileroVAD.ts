import * as ort from 'onnxruntime-web';
import { BaseVADEngine } from './base';
import type { VADResult, VADConfig, VADStreamProcessor } from './types';

const MODEL_URL = '/models/silero_vad.onnx';
const SAMPLE_RATE = 16000;
const REQUIRED_SAMPLES = 512;

export class SileroVADEngine extends BaseVADEngine {
  private model: ort.InferenceSession | null = null;
  private state: ort.Tensor | null = null;
  private loadingPromise: Promise<void> | null = null;
  
  private inputName = 'input';
  private stateInputName = 'state';
  private sampleRateInputName: string | null = null;
  private outputName = 'output';
  private stateOutputName = 'state';
  
  private probabilityHistory: number[] = [];
  private previousResult: VADResult | null = null;
  
  constructor(config: VADConfig) {
    super(config);
  }

  async load(): Promise<void> {
    if (this.isLoaded && this.model) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      try {
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
        
        this.model = await ort.InferenceSession.create(MODEL_URL, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
        
        this.detectModelNames();
        this.initializeState();
        
        this.isLoaded = true;
        console.log('Silero VAD loaded successfully');
      } catch (error) {
        console.error('Failed to load Silero VAD:', error);
        throw error;
      } finally {
        this.loadingPromise = null;
      }
    })();

    return this.loadingPromise;
  }

  private detectModelNames(): void {
    if (!this.model) return;

    this.inputName = this.model.inputNames.find(name => 
      ['input', 'audio', 'waveform', 'x'].includes(name)
    ) || this.model.inputNames[0];
    
    this.stateInputName = this.model.inputNames.find(name => 
      name.includes('state')
    ) || 'state';
    
    this.sampleRateInputName = this.model.inputNames.find(name => 
      ['sr', 'sample_rate'].includes(name) || name.includes('sr')
    ) || null;
    
    this.outputName = this.model.outputNames.find(name => 
      ['output', 'logits', 'prob', 'output_0'].includes(name)
    ) || this.model.outputNames[0];
    
    this.stateOutputName = this.model.outputNames.find(name => 
      name.includes('state') && name !== this.outputName
    ) || this.model.outputNames[1] || this.model.outputNames[0];
  }

  private initializeState(): void {
    const stateShape = [2, 1, 128];
    const stateSize = stateShape[0] * stateShape[1] * stateShape[2];
    this.state = new ort.Tensor('float32', new Float32Array(stateSize), stateShape);
  }

  reset(): void {
    if (this.state) {
      const stateSize = this.state.data.length;
      this.state = new ort.Tensor('float32', new Float32Array(stateSize), this.state.dims);
    }
    this.probabilityHistory = [];
    this.previousResult = null;
  }

  private resampleTo16kHz(audioBuffer: AudioBuffer): Float32Array {
    if (audioBuffer.sampleRate === SAMPLE_RATE) {
      return audioBuffer.getChannelData(0);
    }

    const ratio = audioBuffer.sampleRate / SAMPLE_RATE;
    const sourceData = audioBuffer.getChannelData(0);
    const targetLength = Math.floor(sourceData.length / ratio);
    const targetData = new Float32Array(targetLength);

    for (let i = 0; i < targetLength; i++) {
      targetData[i] = sourceData[Math.floor(i * ratio)];
    }

    return targetData;
  }

  private normalize(audio: Float32Array): Float32Array {
    const max = Math.max(...Array.from(audio).map(Math.abs));
    return max > 0 ? audio.map(s => s / max) : audio;
  }

  private prepareAudioChunk(audioBuffer: AudioBuffer): Float32Array {
    let audioData = this.resampleTo16kHz(audioBuffer);
    audioData = this.normalize(audioData);

    if (audioData.length < REQUIRED_SAMPLES) {
      const padded = new Float32Array(REQUIRED_SAMPLES);
      padded.set(audioData, 0);
      return padded;
    }
    
    return audioData.slice(0, REQUIRED_SAMPLES);
  }

  private extractProbability(output: ort.Tensor): number {
    if (Array.isArray(output.data)) {
      return Number(output.data[0]) || 0;
    }
    if (output.data instanceof Float32Array) {
      return output.data[0];
    }
    return (output.data as unknown as ArrayLike<number>)[0] || 0;
  }

  private smoothProbability(probability: number): number {
    if (probability < this.config.offsetThreshold) {
      if (this.probabilityHistory.length > 0) {
        const avg = this.probabilityHistory.reduce((a, b) => a + b, 0) / this.probabilityHistory.length;
        if (avg >= this.config.offsetThreshold) {
          this.probabilityHistory = [];
        }
      }
    }
    
    this.probabilityHistory.push(probability);
    const smoothingWindow = this.config.smoothingWindow || 5;
    if (this.probabilityHistory.length > smoothingWindow) {
      this.probabilityHistory.shift();
    }
    
    const sum = this.probabilityHistory.reduce((a, b) => a + b, 0);
    return sum / this.probabilityHistory.length;
  }

  private determineDetectionType(probability: number, previous: VADResult | null): VADResult['type'] {
    if (!previous) {
      return probability >= this.config.onsetThreshold ? 'onset' : 'silence';
    }

    const wasSpeech = previous.isSpeech;
    const threshold = wasSpeech ? this.config.offsetThreshold : this.config.onsetThreshold;
    const isSpeech = probability >= threshold;

    if (!wasSpeech && isSpeech) return 'onset';
    if (wasSpeech && !isSpeech) return 'offset';
    if (isSpeech) return 'continuing';
    return 'silence';
  }

  async detect(audioBuffer: AudioBuffer): Promise<VADResult> {
    if (!this.isLoaded) await this.load();
    if (!this.model || !this.state) {
      throw new Error('Silero VAD model not loaded');
    }

    try {
      const audioData = audioBuffer.getChannelData(0);
      const maxEnergy = Math.max(...Array.from(audioData).map(Math.abs));
      if (maxEnergy < (this.config.minEnergyThreshold || 0.02)) {
        const result: VADResult = {
          probability: 0,
          isSpeech: false,
          confidence: 1 - maxEnergy,
          timestamp: Date.now(),
          type: this.previousResult?.isSpeech ? 'offset' : 'silence',
        };
        this.previousResult = result;
        return result;
      }

      const preparedAudio = this.prepareAudioChunk(audioBuffer);
      const inputTensor = new ort.Tensor('float32', preparedAudio, [1, preparedAudio.length]);

      const feeds: { [key: string]: ort.Tensor } = {
        [this.inputName]: inputTensor,
        [this.stateInputName]: this.state,
      };
      
      if (this.sampleRateInputName) {
        feeds[this.sampleRateInputName] = new ort.Tensor(
          'int64',
          BigInt64Array.from([BigInt(SAMPLE_RATE)]),
          []
        );
      }

      const results = await this.model.run(feeds);
      
      if (results[this.stateOutputName]) {
        this.state = results[this.stateOutputName] as ort.Tensor;
      }
      
      const output = results[this.outputName] as ort.Tensor;
      const rawProbability = this.extractProbability(output);
      const smoothedProbability = this.smoothProbability(rawProbability);
      const isSpeech = smoothedProbability >= (
        this.previousResult?.isSpeech 
          ? this.config.offsetThreshold
          : this.config.onsetThreshold
      );

      const type = this.determineDetectionType(smoothedProbability, this.previousResult);

      const result: VADResult = {
        probability: smoothedProbability,
        isSpeech,
        confidence: Math.abs(smoothedProbability - 0.5) * 2,
        timestamp: Date.now(),
        type,
      };

      this.previousResult = result;
      return result;
    } catch (error) {
      console.error('Silero VAD detection error:', error);
      return {
        probability: 0,
        isSpeech: false,
        confidence: 0,
        timestamp: Date.now(),
        type: 'silence',
      };
    }
  }

  createStreamProcessor(
    audioContext: AudioContext,
    _source: MediaStreamAudioSourceNode
  ): VADStreamProcessor {
    this.reset();

    return async (analyser: AnalyserNode): Promise<boolean> => {
      const buffer = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buffer);

      const ratio = audioContext.sampleRate / SAMPLE_RATE;
      const sourceSamplesNeeded = Math.ceil(REQUIRED_SAMPLES * ratio);
      const sourceData = buffer.subarray(0, Math.min(sourceSamplesNeeded, buffer.length));
      
      const resampled = new Float32Array(REQUIRED_SAMPLES);
      for (let i = 0; i < REQUIRED_SAMPLES; i++) {
        const sourceIndex = Math.floor(i * ratio);
        resampled[i] = sourceIndex < sourceData.length ? sourceData[sourceIndex] : 0;
      }

      const max = Math.max(...Array.from(resampled).map(Math.abs));
      if (max < (this.config.minEnergyThreshold || 0.01)) {
        return false;
      }

      if (max > 0) {
        for (let i = 0; i < resampled.length; i++) {
          resampled[i] /= max;
        }
      }

      const audioBuffer = audioContext.createBuffer(1, resampled.length, SAMPLE_RATE);
      audioBuffer.getChannelData(0).set(resampled);
      
      const result = await this.detect(audioBuffer);
      return result.isSpeech;
    };
  }

  dispose(): void {
    this.model = null;
    this.state = null;
    this.probabilityHistory = [];
    this.previousResult = null;
    this.isLoaded = false;
  }
}

