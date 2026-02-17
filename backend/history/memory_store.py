from typing import Dict, Any, List, Optional
from datetime import datetime
from collections import defaultdict

class InMemoryHistoryStore:
    def __init__(self):
        self._sessions: Dict[str, Dict] = defaultdict(lambda: {
            "inputs": [],
            "responses": [],
            "clusters": [],
            "topics": [],
            "user_preferences": {},
            "created_at": datetime.now(),
            "last_updated": datetime.now()
        })

    def add_input(self, session_id: str, input_data: Dict):
        if not session_id:
            return

        self._sessions[session_id]["inputs"].append({
            **input_data,
            'timestamp': datetime.now()
        })
        self._sessions[session_id]['last_updated'] = datetime.now()

    def add_response(self, session_id: str, response_data: Dict):
        if not session_id:
            return

        self._sessions[session_id]['responses'].append({
            **response_data,
            'timestamp': datetime.now()
        })
        self._sessions[session_id]['last_updated'] = datetime.now()

    def get_clusters(self, session_id: Optional[str]) -> List[Dict]:
        if not session_id or session_id not in self._sessions:
            return []
        return self._sessions[session_id]['clusters']

    def save_clusters(self, session_id: str, clusters: List[Dict]):
        if not session_id:
            return
        self._sessions[session_id]['clusters'] = clusters
        self._sessions[session_id]['last_updated'] = datetime.now()

    def get_history(self, session_id: Optional[str], limit: int = 10) -> Dict:
        if not session_id or session_id not in self._sessions:
            return {
                "inputs": [],
                "responses": [],
                "clusters": [],
                "topics": [],
                "user_preferences": {},
                "created_at": None,
                "last_updated": None
            }
        session = self._sessions[session_id]
        recent_inputs = session["inputs"][-limit:]
        recent_responses = session["responses"][-limit:]

        summary = self._generate_summary(session)

        return {
            "previous_inputs": recent_inputs,
            "previous_responses": recent_responses,
            "session_summary": summary,
            "topics_discussed": session["topics"],
            "user_preferences": session["user_preferences"],
        }

    def _generate_summary(self, session: Dict) -> Optional[str]:
        if not session["inputs"]:
            return None

        input_count = len(session["inputs"])
        response_count = len(session["responses"])

        return f"Session Summary: {input_count} inputs and {response_count} responses."

history_store = InMemoryHistoryStore()