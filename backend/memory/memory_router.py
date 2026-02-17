from typing import Dict, Optional, Tuple
from memory.organization_memory import organization_memory
from memory.user_memory import user_memory

class MemoryRouter:
    
    def __init__(self):
        self.org_memory = organization_memory
        self.user_memory = user_memory
        self.scope_threshold = 0.55
    
    async def query_memories(self, query: str, user_id: Optional[str] = None) -> Dict:
        results = {
            "org_memories": [],
            "user_memories": [],
            "in_scope": False,
            "confidence": 0.0,
            "combined_context": ""
        }
        
        org_results = await self.org_memory.search(query, top_k=3, threshold=self.scope_threshold)
        results["org_memories"] = org_results
        
        if user_id:
            user_results = await self.user_memory.search(str(user_id), query, top_k=3, threshold=self.scope_threshold)
            results["user_memories"] = user_results
        
        max_similarity = 0.0
        if org_results:
            max_similarity = max(m["similarity"] for m in org_results)
        if results["user_memories"]:
            user_max = max(m["similarity"] for m in results["user_memories"])
            max_similarity = max(max_similarity, user_max)
        
        results["confidence"] = max_similarity
        results["in_scope"] = max_similarity >= self.scope_threshold
        
        context_parts = []
        if org_results:
            context_parts.append("=== ORGANIZATION KNOWLEDGE ===")
            for mem in org_results[:2]: 
                context_parts.append(f"- {mem['text']}")
        
        if results["user_memories"]:
            context_parts.append("\n=== USER CONTEXT ===")
            for mem in results["user_memories"][:2]: 
                context_parts.append(f"- {mem['text']}")
        
        results["combined_context"] = "\n".join(context_parts)
        
        return results

memory_router = MemoryRouter()