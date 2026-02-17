from typing import List, Dict, Optional, Any
from datetime import datetime
from pydantic import BaseModel

class ClusterEnvelope(BaseModel):
    bucket_id: int
    items: List[Dict]
    normalized_text: str
    input_types: List[str]
    item_count: int
    semantic_summary: Optional[str] = None
    confidence_score: float = 1.0
    requires_clarification: bool = False
    clarification_questions: List[str] = []

class ConversationHistory(BaseModel):
    previous_inputs: List[Dict] = []
    previous_responses: List[Dict] = []
    session_summary: Optional[str] = None
    topics_discussed: List[str] = []
    user_preferences: Dict[str, Any] = {}

class ContextEnvelope(BaseModel):
    input_id: str
    timestamp: datetime
    metadata: Dict[str, Any]
    cluster_envelopes: List[ClusterEnvelope]
    conversation_history: ConversationHistory
    alternative_interpretations: List[List[ClusterEnvelope]] = []
    conflicts: List[Dict] = []
    cluster_relationships: Dict[str, Any] = {}
    estimated_complexity: str = "medium"
    reasoning_trace: List[str] = []