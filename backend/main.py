from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.input import router as input_router
from api.admin import router as admin_router
from memory.file_loader import initialize_organization_memory_from_files

app = FastAPI(title="OmniChannel", description="OmniChannel API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(input_router)
app.include_router(admin_router)

@app.on_event("startup")
async def startup_event():
    await initialize_organization_memory_from_files()
    
@app.get("/health")
async def health():
    return {"status": "ok"}
