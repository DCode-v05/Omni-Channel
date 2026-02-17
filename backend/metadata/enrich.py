from datetime import datetime

from schemas.models import MetaData


def add_metadata(channel: str, user_id: str, session_id: str) -> MetaData:
    return MetaData(channel=channel, user_id=user_id, session_id=str(session_id) if session_id else None, timestamp=datetime.now())