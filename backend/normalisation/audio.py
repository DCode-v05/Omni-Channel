import whisper
import asyncio

from schemas.models import GatewayOutput

_model = None

def get_whisper_model():
    global _model
    if _model is None:
        _model = whisper.load_model("base")
    return _model

async def normalize_audio(gateway_output: GatewayOutput) -> str:
    path = gateway_output.raw_payload_ref.replace("local://", "")
    model = get_whisper_model()
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: model.transcribe(path, task="transcribe", language="en"))
    return result["text"]