from typing import List, Dict, Optional
from datetime import datetime
from pathlib import Path
import logging
import re
import numpy as np
from semantic.embeddings import get_embeddings, cosine_similarity
from normalisation.document import _extract_text_from_txt, _extract_text_from_doc

logger = logging.getLogger(__name__)

class OrganizationMemory:
    
    def __init__(self):
        self._knowledge_base: List[Dict] = []
    
    async def add_knowledge(self, text: str, category: str = "general", metadata: Optional[Dict] = None):
        embedding = await get_embeddings([text])
        self._knowledge_base.append({
            "text": text,
            "category": category,
            "metadata": metadata or {},
            "embedding": embedding[0],
            "created_at": datetime.now()
        })
    
    async def search(self, query: str, top_k: int = 3, threshold: float = 0.65) -> List[Dict]:
        if not self._knowledge_base:
            return []
        
        query_embedding = await get_embeddings([query])
        results = []
        
        for item in self._knowledge_base:
            sim = cosine_similarity(query_embedding[0], item["embedding"])
            if sim >= threshold:
                results.append({
                    "text": item["text"],
                    "category": item["category"],
                    "similarity": float(sim)
                })
        
        results.sort(key=lambda x: x["similarity"], reverse=True)
        return results[:top_k]
    
    def _split_into_chunks(self, text: str, max_chunk_size: int = 500) -> List[str]:
        paragraphs = re.split(r'\n\s*\n', text)
        chunks = []
        
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            
            if len(para) <= max_chunk_size:
                chunks.append(para)
            else:
                sentences = re.split(r'(?<=[.!?])\s+', para)
                current_chunk = ""
                
                for sentence in sentences:
                    sentence = sentence.strip()
                    if not sentence:
                        continue
                    
                    if current_chunk and len(current_chunk) + len(sentence) + 1 > max_chunk_size:
                        chunks.append(current_chunk)
                        current_chunk = sentence
                    else:
                        if current_chunk:
                            current_chunk += " " + sentence
                        else:
                            current_chunk = sentence
                
                if current_chunk:
                    chunks.append(current_chunk)
        
        return chunks
    
    async def load_from_directory(self, directory_path: str, chunk_size: int = 500):
        directory = Path(directory_path)
        if not directory.exists():
            logger.info("Directory %s does not exist. Creating it...", directory_path)
            directory.mkdir(parents=True, exist_ok=True)
            return
        
        loaded_count = 0
        for file_path in directory.glob("*"):
            if file_path.suffix.lower() in [".txt", ".docx", ".doc"]:
                try:
                    if file_path.suffix.lower() == ".txt":
                        text = _extract_text_from_txt(file_path)
                    elif file_path.suffix.lower() in [".docx", ".doc"]:
                        text = _extract_text_from_doc(file_path)
                    else:
                        continue
                    
                    chunks = self._split_into_chunks(text, chunk_size)
                    
                    category = file_path.stem
                    for chunk in chunks:
                        if chunk.strip(): 
                            await self.add_knowledge(
                                text=chunk.strip(),
                                category=category,
                                metadata={"source_file": str(file_path.name)}
                            )
                            loaded_count += 1
                    
                    logger.info("Loaded %d chunks from %s", len(chunks), file_path.name)
                except Exception as e:
                    logger.error("Error loading %s: %s", file_path.name, e)
        
        logger.info("Total knowledge chunks loaded: %d", loaded_count)
    
    async def reload_from_directory(self, directory_path: str):
        self._knowledge_base = []
        await self.load_from_directory(directory_path)

organization_memory = OrganizationMemory()