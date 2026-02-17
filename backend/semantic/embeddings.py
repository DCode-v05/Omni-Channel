from sentence_transformers import SentenceTransformer
import numpy as np
from typing import List
from collections import OrderedDict
import asyncio
import hashlib

_model = None
_embeddings_cache = OrderedDict()
_CACHE_MAX_SIZE = 1000

def get_embedding_model():
    global _model
    if _model is None:
        _model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    return _model

async def get_embeddings(texts: List[str]) -> np.ndarray:
    cache_key = hashlib.md5("|".join(texts).encode()).hexdigest()
    if cache_key in _embeddings_cache:
        _embeddings_cache.move_to_end(cache_key)
        return _embeddings_cache[cache_key]

    model = get_embedding_model()
    loop = asyncio.get_event_loop()
    embeddings = await loop.run_in_executor(None, lambda: model.encode(texts, convert_to_numpy=True))
    _embeddings_cache[cache_key] = embeddings
    if len(_embeddings_cache) > _CACHE_MAX_SIZE:
        _embeddings_cache.popitem(last=False)
    return embeddings

def cosine_similarity(embeddings1: np.ndarray, embeddings2: np.ndarray) -> float:
    return np.dot(embeddings1, embeddings2) / (np.linalg.norm(embeddings1) * np.linalg.norm(embeddings2))