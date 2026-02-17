export interface SentimentData {
  sentiment: 'frustrated' | 'excited' | 'neutral' | 'sarcastic' | 'calm';
  tone?: string;
  pitch_trend?: 'dropping' | 'rising' | 'stable';
  urgency?: number;
  emotional_intensity?: number;
}

export interface ProsodySettings {
  speed: number;
  pitch: number;
  stability: number;
  style?: string;
}

export function getProsodyFromSentiment(sentiment: SentimentData): ProsodySettings {
  const base: ProsodySettings = {
    speed: 1.0,
    pitch: 0,
    stability: 0.5,
  };

  switch (sentiment.sentiment) {
    case 'frustrated':
      return {
        ...base,
        speed: 0.85,
        pitch: -10,
        stability: 0.7,
        style: 'calm',
      };
    
    case 'excited':
      return {
        ...base,
        speed: 1.2,
        pitch: +15,
        stability: 0.3,
        style: 'upbeat',
      };
    
    case 'sarcastic':
      return {
        ...base,
        speed: 0.95,
        pitch: -5,
        stability: 0.4,
        style: 'sarcastic',
      };
    
    default:
      return base;
  }
}


export function preprocessTextForTts(text: string): string {
  if (!text) return text;
  
  let processed = text;
  
  processed = processed.replace(/\s+/g, ' ');

  processed = processed.replace(/\.{2,}/g, '.');

  processed = processed.replace(/\.([^\s])/g, '. $1');

  processed = processed.replace(/\s{2,}/g, ' ');
  
  return processed.trim();
}