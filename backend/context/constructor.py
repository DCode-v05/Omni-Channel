from typing import List, Dict, Optional, Any
from datetime import datetime

from semantic.clustering import InputItem
from semantic.embeddings import get_embeddings, cosine_similarity
from context.envelope import ContextEnvelope, ClusterEnvelope, ConversationHistory
from schemas.models import MetaData
from history.memory_store import history_store

COMPLEXITY_THRESHOLDS = {
    "COMPLEX_CLUSTERS": 3,
    "COMPLEX_ITEMS": 5,
    "COMPLEX_TEXT_LENGTH": 5000,
    "SIMPLE_TEXT_LENGTH": 500,
}

SEMANTIC_SUMMARY_MAX_LENGTH = 200
SEMANTIC_SUMMARY_PREVIEW_LENGTH = 100
HISTORY_LIMIT = 10

class ContextEnvelopeConstructor:
    def __init__(self):
        self.history_service = None

    async def construct_envelope(self, input_items: List[InputItem], clusters: List[Dict], metadata: MetaData, input_id: str, alternative_interpretations: Optional[List[List[Dict]]] = None, conflicts: Optional[List[Dict]] = None) -> ContextEnvelope:
        reasoning_trace = [f"Constructing context envelope for input {input_id}"]
        cluster_envelopes = await self._build_cluster_envelopes(clusters, reasoning_trace)
        conversation_history = await self._get_conversation_history(metadata.session_id, reasoning_trace)
        cluster_relationships = await self._analyze_cluster_relationships(cluster_envelopes, reasoning_trace)
        complexity = self._assess_complexity(cluster_envelopes)
        alt_envelopes = await self._build_alternative_envelopes(input_items, alternative_interpretations, reasoning_trace)
        reasoning_trace.append(f"Envelope construction complete: {len(cluster_envelopes)} clusters")
        
        return ContextEnvelope(
            input_id=input_id,
            timestamp=datetime.now(),
            metadata=self._format_metadata(metadata),
            cluster_envelopes=cluster_envelopes,
            conversation_history=conversation_history,
            alternative_interpretations=alt_envelopes,
            conflicts=conflicts or [],
            cluster_relationships=cluster_relationships,
            estimated_complexity=complexity,
            reasoning_trace=reasoning_trace
        )

    async def _build_cluster_envelopes(self, clusters: List[Dict], reasoning_trace: List[str]) -> List[ClusterEnvelope]:
        cluster_envelopes = []
        
        for cluster in clusters:
            combined_text = self._extract_cluster_text(cluster)
            semantic_summary = await self._generate_semantic_summary(combined_text)
            
            reasoning_trace.append(f"Built envelope for cluster {cluster['bucket_id']}: {cluster['item_count']} items, types: {cluster['input_types']}")
            
            cluster_envelopes.append(ClusterEnvelope(
                bucket_id=cluster['bucket_id'],
                items=cluster['items'],
                normalized_text=combined_text,
                input_types=cluster['input_types'],
                item_count=cluster['item_count'],
                semantic_summary=semantic_summary,
                confidence_score=1.0,
                requires_clarification=False,
                clarification_questions=[]
            ))
        
        return cluster_envelopes

    def _extract_cluster_text(self, cluster: Dict) -> str:
        cluster_texts = []
        
        for cluster_item in cluster.get('items', []):
            if 'normalized_text' in cluster_item:
                cluster_texts.append(cluster_item['normalized_text'])
            elif 'text_preview' in cluster_item:
                cluster_texts.append(cluster_item['text_preview'])
            elif 'original_data' in cluster_item:
                gw_output = cluster_item['original_data'].get('gateway_output', {})
                if 'raw_text' in gw_output:
                    cluster_texts.append(gw_output['raw_text'])
        
        return "\n\n".join(cluster_texts) if cluster_texts else ""

    async def _generate_semantic_summary(self, text: str) -> Optional[str]:
        if len(text) > SEMANTIC_SUMMARY_MAX_LENGTH:
            return text[:SEMANTIC_SUMMARY_PREVIEW_LENGTH] + "..."
        return text

    async def _build_alternative_envelopes(self, input_items: List[InputItem], alternative_interpretations: Optional[List[List[Dict]]], reasoning_trace: List[str]) -> List[List[ClusterEnvelope]]:
        if not alternative_interpretations:
            return []
        
        alt_envelopes = []
        for alt_clusters in alternative_interpretations:
            alt_envelopes.append(await self._build_cluster_envelopes(alt_clusters, reasoning_trace))
        return alt_envelopes

    async def _get_conversation_history(self, session_id: Optional[str], reasoning_trace: List[str]) -> ConversationHistory:
        if not session_id:
            return ConversationHistory()
        
        reasoning_trace.append(f"Retrieving history for session {session_id}")
        history_data = history_store.get_history(session_id, limit=HISTORY_LIMIT)
        
        return ConversationHistory(
            previous_inputs=history_data['previous_inputs'],
            previous_responses=history_data['previous_responses'],
            session_summary=history_data['session_summary'],
            topics_discussed=history_data['topics_discussed'],
            user_preferences=history_data['user_preferences']
        )

    async def _analyze_cluster_relationships(self, cluster_envelopes: List[ClusterEnvelope], reasoning_trace: List[str], existing_embeddings: Optional[List[List[float]]] = None) -> Dict[str, Any]:
        if len(cluster_envelopes) < 2:
            return {"relationship_type": "single_cluster"}
        
        cluster_texts = [env.normalized_text for env in cluster_envelopes]

        if existing_embeddings:
            embeddings = existing_embeddings
        else:
            embeddings = await get_embeddings(cluster_texts)
        
        relationships = self._calculate_pairwise_similarities(
            cluster_envelopes, embeddings
        )
        
        reasoning_trace.append(
            f"Cluster relationships analyzed: {len(cluster_envelopes)} clusters, "
            f"max similarity: {relationships.get('max_similarity', 0):.2f}, "
            f"min: {relationships.get('min_similarity', 0):.2f}"
        )
        
        return relationships

    def _calculate_pairwise_similarities(self, cluster_envelopes: List[ClusterEnvelope], embeddings: List[List[float]]) -> Dict[str, Any]:
        relationships = {
            "relationship_type": "multi_cluster",
            "pairwise_similarities": {},
            "most_similar_pair": None,
            "least_similar_pair": None
        }
        
        max_sim = -1
        min_sim = 2
        max_pair = None
        min_pair = None
        
        for i in range(len(cluster_envelopes)):
            for j in range(i + 1, len(cluster_envelopes)):
                sim = cosine_similarity(embeddings[i], embeddings[j])
                pair_key = f"{i}-{j}"
                relationships["pairwise_similarities"][pair_key] = float(sim)
                
                if sim > max_sim:
                    max_sim = sim
                    max_pair = pair_key
                if sim < min_sim:
                    min_sim = sim
                    min_pair = pair_key
        
        relationships["most_similar_pair"] = max_pair
        relationships["least_similar_pair"] = min_pair
        relationships["max_similarity"] = float(max_sim)
        relationships["min_similarity"] = float(min_sim)
        
        return relationships

    def _assess_complexity(self, cluster_envelopes: List[ClusterEnvelope]) -> str:
        total_items = sum(env.item_count for env in cluster_envelopes)
        total_text_length = sum(len(env.normalized_text) for env in cluster_envelopes)
        num_clusters = len(cluster_envelopes)
        
        if (num_clusters > COMPLEXITY_THRESHOLDS["COMPLEX_CLUSTERS"] or
            total_items > COMPLEXITY_THRESHOLDS["COMPLEX_ITEMS"] or
            total_text_length > COMPLEXITY_THRESHOLDS["COMPLEX_TEXT_LENGTH"]):
            return "complex"
        
        if (num_clusters == 1 and
            total_items == 1 and
            total_text_length < COMPLEXITY_THRESHOLDS["SIMPLE_TEXT_LENGTH"]):
            return "simple"
        
        return "medium"

    def _format_metadata(self, metadata: MetaData) -> Dict[str, Any]:
        return {
            "channel": metadata.channel,
            "user_id": str(metadata.user_id) if metadata.user_id else None,
            "session_id": str(metadata.session_id) if metadata.session_id else None,
        }