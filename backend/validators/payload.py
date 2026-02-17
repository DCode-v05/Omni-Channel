from fastapi import HTTPException, UploadFile

MAX_TEXT_LENGTH = 10000
MAX_AUDIO_SIZE_MB = 20
MAX_DOC_SIZE_MB = 20
MAX_IMAGE_SIZE_MB = 20

ALLOWED_AUDIO_FORMATS = {"audio/mpeg", "audio/wav", "audio/webm"}
ALLOWED_DOC_FORMATS = {"application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"}
ALLOWED_IMAGE_FORMATS = {"image/jpeg", "image/png", "image/jpg"}

def validate_text_payload(text: str) -> None:
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text payload is required")
    
    if len(text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=413, detail="Text payload exceeds maximum length")

def _validate_file_size(file: UploadFile, max_size_mb: int) -> None:
    if file.size is None:
        return
    if file.size > max_size_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File size exceeds maximum allowed size")

def validate_audio_payload(audio: UploadFile) -> None:
    if audio.content_type:
        content_type_audio = audio.content_type.split(";")[0].strip()
        if content_type_audio not in ALLOWED_AUDIO_FORMATS:
            raise HTTPException(status_code=415, detail="Unsupported audio format")
    else:
        raise HTTPException(status_code=415, detail="Unsupported audio format")
    _validate_file_size(audio, MAX_AUDIO_SIZE_MB)

def validate_document_payload(document: UploadFile) -> None:
    if document.content_type not in ALLOWED_DOC_FORMATS:
        raise HTTPException(status_code=415, detail="Unsupported document format")
    _validate_file_size(document, MAX_DOC_SIZE_MB)

def validate_image_payload(image: UploadFile) -> None:
    if image.content_type not in ALLOWED_IMAGE_FORMATS:
        raise HTTPException(status_code=415, detail="Unsupported image format")
    _validate_file_size(image, MAX_IMAGE_SIZE_MB)