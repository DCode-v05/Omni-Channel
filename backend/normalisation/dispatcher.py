from schemas.models import GatewayOutput
from normalisation.text import normalize_text
from normalisation.audio import normalize_audio
from normalisation.document import normalize_document
from normalisation.image import normalize_image

async def normalize_input(gateway_output: GatewayOutput) -> str:
    if gateway_output.input_type == "text":
        return normalize_text(gateway_output)
    elif gateway_output.input_type == "audio":
        return await normalize_audio(gateway_output)
    elif gateway_output.input_type == "document":
        return await normalize_document(gateway_output)
    elif gateway_output.input_type == "image":
        return await normalize_image(gateway_output)
    else:
        raise ValueError(f"Unsupported input type: {gateway_output.input_type}")
