from typing import List, Dict, Optional
from datetime import datetime
from collections import defaultdict
import numpy as np
from semantic.embeddings import get_embeddings, cosine_similarity

class UserMemory:
    def __init__(self):
        self._user_memories: Dict[str, List[Dict]] = defaultdict(list)
        self._user_embeddings: Dict[str, List[np.ndarray]] = defaultdict(list)
        self._max_memories_per_user = 100
        self._query_cache: Dict[str, np.ndarray] = {}
        self._cache_size = 50
    
    async def add_memory(self, user_id: str, text: str, context: Optional[Dict] = None, importance: float = 0.5):
        if not user_id:
            return
        
        embedding = await get_embeddings([text])
        memory = {
            "text": text,
            "context": context or {},
            "importance": importance,
            "embedding": embedding[0],
            "created_at": datetime.now(),
            "access_count": 0
        }
        
        self._user_memories[user_id].append(memory)
        self._user_embeddings[user_id].append(embedding[0])
        
        if len(self._user_memories[user_id]) > self._max_memories_per_user:
            self._user_memories[user_id] = self._user_memories[user_id][-self._max_memories_per_user:]
            self._user_embeddings[user_id] = self._user_embeddings[user_id][-self._max_memories_per_user:]
    
    async def search(self, user_id: str, query: str, top_k: int = 3, threshold: float = 0.6) -> List[Dict]:
        if not user_id or user_id not in self._user_memories:
            return []
        
        if query in self._query_cache:
            query_embedding = [self._query_cache[query]]
        else:
            query_embedding = await get_embeddings([query])
            if len(self._query_cache) >= self._cache_size:
                oldest_key = next(iter(self._query_cache))
                del self._query_cache[oldest_key]
            self._query_cache[query] = query_embedding[0]
        
        memories = self._user_memories[user_id]
        embeddings = self._user_embeddings[user_id]
        
        search_limit = min(20, len(memories))
        recent_memories = memories[-search_limit:]
        recent_embeddings = embeddings[-search_limit:]
        
        results = []
        for memory, embedding in zip(recent_memories, recent_embeddings):
            sim = cosine_similarity(query_embedding[0], embedding)
            adjusted_sim = sim * (1 + memory["importance"] * 0.2) 
            
            if adjusted_sim >= threshold:
                results.append({
                    "text": memory["text"],
                    "similarity": float(adjusted_sim),
                    "importance": memory["importance"]
                })
                memory["access_count"] += 1
        
        results.sort(key=lambda x: x["similarity"], reverse=True)
        return results[:top_k]
    
    async def learn_from_interaction(self, user_id: str, user_input: str, response: str, sentiment: Optional[Dict] = None):
        if not user_id:
            return
        
        importance = 0.7 if sentiment and sentiment.get("sentiment") in ["frustrated", "excited"] else 0.5
        
        truncated_input = user_input[:200]
        truncated_response = response[:100]
        
        await self.add_memory(
            user_id=str(user_id),
            text=f"User: {truncated_input}",
            context={"response": truncated_response, "sentiment": sentiment},
            importance=importance
        )

user_memory = UserMemory()