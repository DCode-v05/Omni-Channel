from paddleocr import PaddleOCR

from schemas.models import GatewayOutput

_model = None

def get_image_model():
    global _model
    if _model is None:
        _model = PaddleOCR(lang="en", use_gpu=False, show_log=False)
    return _model

async def normalize_image(gateway_output: GatewayOutput) -> str:
    path = gateway_output.raw_payload_ref.replace("local://", "")
    model = get_image_model()
    result = model.ocr(path)

    if not result or not result[0]:
        return ""
    lines = [line[1][0] for line in result[0]]
    full_text = "\n".join(lines)
    return full_text