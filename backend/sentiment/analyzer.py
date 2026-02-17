from typing import Dict
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification   

_model = None
_tokenizer = None

def get_model():
    global _model, _tokenizer
    if _model is None or _tokenizer is None:
        _tokenizer = AutoTokenizer.from_pretrained("j-hartmann/emotion-english-distilroberta-base")
        _model = AutoModelForSequenceClassification.from_pretrained("j-hartmann/emotion-english-distilroberta-base")
        _model.eval()

    return _tokenizer, _model

async def analyze_sentiment_and_tone(text: str) -> Dict:
    tokenizer, model = get_model()
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)

    with torch.no_grad():
        outputs = model(**inputs)
        probs = torch.softmax(outputs.logits, dim=-1)[0]

    label_id = torch.argmax(probs).item()
    label = _model.config.id2label[label_id]

    return {
        "sentiment": label
    }