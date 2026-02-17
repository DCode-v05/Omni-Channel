from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class MetaData(BaseModel):
    channel: str = Field(..., description="Channel of the input")
    user_id: Optional[str] = Field(None, description="User ID of the input")
    session_id: Optional[str] = Field(None, description="Session ID of the input")
    timestamp: datetime = Field(..., description="Timestamp of the input")

class GatewayOutput(BaseModel):
    input_id: Optional[str] = Field(None, description="Input ID")
    input_type: str = Field(..., description="Type of the input: text | audio | document")
    raw_payload_ref: str = Field(..., description="Reference to the raw payload or 'inline'")
    content_type: str = Field(..., description="MIME type of the input")
    metadata: MetaData = Field(..., description="Metadata of the input")
    raw_text: Optional[str] = Field(None, description="Raw text of the input")