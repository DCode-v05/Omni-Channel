def detect_input_type(content_type: str) -> str:
    if content_type.startswith("plain/text"):
        return "text"
    elif content_type.startswith("audio"):
        return "audio"
    elif content_type.startswith("image"):
        return "image"
    return "document"