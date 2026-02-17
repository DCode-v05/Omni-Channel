import random
import re
from typing import Dict, Any, Optional

def map_emotion_to_sentiment(label: str, emotional_intensity: float) -> Dict[str, Any]:
    emotion_to_sentiment = {
        'joy': 'happy',
        'sadness': 'neutral',
        'anger': 'neutral',  
        'fear': 'neutral',   
        'surprise': 'surprised',
        'disgust': 'neutral', 
        'neutral': 'neutral',
    }
    
    mapped_sentiment = emotion_to_sentiment.get(label.lower(), 'neutral')
    
    if label.lower() == 'joy' and emotional_intensity > 0.7:
        mapped_sentiment = 'excited'
    
    return {
        'sentiment': mapped_sentiment,
        'emotional_intensity': emotional_intensity
    }

LIGHT_DISFLUENCIES = ["um", "uh", "well"]
CONVERSATION_FILLERS = ["you know", "I mean", "like"]
EMOTIONAL_SOUNDS = {
    'excited': ["haha", "hehe", "oh wow", "that's amazing"],
    'happy': ["haha", "nice", "great"],
    'surprised': ["oh", "whoa", "wow"],
    'thoughtful': ["hmm", "let me think", "well"],
}

NATURAL_CORRECTIONS = [
    ("I think", "actually"),
    ("maybe", "probably"), 
    ("kind of", "really"),
    ("sort of", "definitely")
]

def inject_disfluencies(text: str, intensity: float = 0.3, user_sentiment: Optional[Dict[str, Any]] = None) -> str:
    if not text or len(text.strip()) == 0:
        return text
    
    intensity = min(intensity, 0.7)  
    
    sentences = re.split(r'([.!?]+)', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    
    if not sentences:
        return text
    
    result = []
    
    for i, sentence in enumerate(sentences):
        if len(sentence) < 3 or re.match(r'^[.!?]+$', sentence):
            result.append(sentence)
            continue
            
        processed = sentence
        
        if i == 0 and user_sentiment:
            processed = _add_emotional_opening(processed, user_sentiment, intensity)
        
        if len(sentence.split()) > 5: 
            processed = _add_light_disfluencies(processed, intensity * 0.4) 
        
        if random.random() < intensity * 0.1: 
            processed = _add_natural_corrections(processed)
        
        result.append(processed)
    
    final_text = " ".join(result)
    
    if user_sentiment:
        sentiment = user_sentiment.get('sentiment', 'neutral')
        if sentiment == 'excited':
            final_text = _add_excitement_expressions(final_text, intensity)
        elif sentiment == 'happy' and user_sentiment.get('emotional_intensity', 0.5) > 0.6:
            final_text = _add_excitement_expressions(final_text, intensity * 0.6)
    
    return final_text

def _add_emotional_opening(sentence: str, user_sentiment: Dict[str, Any], intensity: float) -> str:
    sentiment = user_sentiment.get('sentiment', 'neutral')
    emotional_intensity = user_sentiment.get('emotional_intensity', 0.5)
    
    if sentiment == 'excited':
        threshold = 0.5 if intensity > 0.5 else 0.6
        if emotional_intensity > threshold:
            chance = 0.6 if intensity > 0.5 else 0.4
            if random.random() < chance:
                sound = random.choice(EMOTIONAL_SOUNDS['excited'])
                return f"{sound}, {sentence}"
    elif sentiment == 'happy':
        chance = 0.3 * (emotional_intensity / 0.5)
        chance = min(chance, 0.5) 
        if random.random() < chance:
            sound = random.choice(EMOTIONAL_SOUNDS['happy'])
            return f"{sound}, {sentence}"
    elif sentiment == 'surprised':
        chance = 0.4 * (emotional_intensity / 0.5)
        chance = min(chance, 0.6)
        if random.random() < chance:
            sound = random.choice(EMOTIONAL_SOUNDS['surprised'])
            return f"{sound}, {sentence}"
    elif sentiment == 'thoughtful':
        if random.random() < 0.2:
            sound = random.choice(EMOTIONAL_SOUNDS['thoughtful'])
            return f"{sound}, {sentence}"
    
    return sentence

def _add_light_disfluencies(sentence: str, probability: float) -> str:
    words = sentence.split()
    if len(words) < 6:
        return sentence
    
    result = []
    
    for i, word in enumerate(words):
        result.append(word)
        
        if i == len(words) // 2 and random.random() < probability:
            disfluency = random.choice(LIGHT_DISFLUENCIES)
            result.append(f" {disfluency},")
        elif i > 2 and i < len(words) - 2 and random.random() < probability * 0.3:
            if words[i].endswith(',') or words[i].endswith(':'):
                filler = random.choice(CONVERSATION_FILLERS)
                result.append(f" {filler},")
    
    return " ".join(result)

def _add_natural_corrections(sentence: str) -> str:
    sentence_lower = sentence.lower()
    
    for trigger, correction in NATURAL_CORRECTIONS:
        if trigger.lower() in sentence_lower:
            pattern = re.compile(re.escape(trigger), re.IGNORECASE)
            if pattern.search(sentence):
                replacement = f"{trigger}... {correction}"
                sentence = pattern.sub(replacement, sentence, count=1)
                break
    
    return sentence

def _add_excitement_expressions(text: str, intensity: float) -> str:
    if random.random() < intensity * 0.5:
        sentences = text.split('. ')
        if len(sentences) > 1:
            mid_point = len(sentences) // 2
            if mid_point < len(sentences):
                excitement = random.choice(["haha", "that's great", "awesome"])
                sentences[mid_point] = f"{sentences[mid_point]} {excitement},"
        text = '. '.join(sentences)
    
    return text