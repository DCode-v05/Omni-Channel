from pathlib import Path
import pdfplumber
from docx import Document

from schemas.models import GatewayOutput

def _extract_text_from_pdf(path: str) -> str:
    text_chunks = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_chunks.append(page_text)
    return "\n".join(text_chunks)

def _extract_text_from_doc(path: Path) -> str:
    text_chunks = []
    doc = Document(path)
    for para in doc.paragraphs:
        if para.text.strip():
            text_chunks.append(para.text)
    return "\n".join(text_chunks)

def _extract_text_from_txt(path: Path) -> str:
    with open(path, "r", encoding="utf-8", errors="ignore") as file:
        return file.read()

async def normalize_document(gateway_output: GatewayOutput) -> str:
    path = Path(gateway_output.raw_payload_ref.replace("local://", ""))
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        return _extract_text_from_pdf(path)
    elif suffix in (".doc", ".docx"):
        return _extract_text_from_doc(path)
    elif suffix == ".txt":
        return _extract_text_from_txt(path)
    else:
        raise ValueError(f"Unsupported document type: {suffix}")