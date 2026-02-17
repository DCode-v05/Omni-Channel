from schemas.models import GatewayOutput

def normalize_text(gateway_output: GatewayOutput) -> str:
    if not gateway_output.raw_text:
        raise ValueError("Raw text is required for text normalization")
    
    return gateway_output.raw_text