import os
from fastapi import UploadFile

BASE_STORAGE_PATH = "storage/file_storage"
os.makedirs(BASE_STORAGE_PATH, exist_ok=True)

async def save_file(file: UploadFile, input_id: str, category: str) -> str:
    category_path = os.path.join(BASE_STORAGE_PATH, category)
    os.makedirs(category_path, exist_ok=True)
    file_extension = os.path.splitext(file.filename)[1]
    file_name = f"{input_id}{file_extension}"
    file_path = os.path.join(category_path, file_name)
    with open(file_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)
    return f"local://{file_path}"