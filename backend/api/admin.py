from fastapi import APIRouter
from memory.file_loader import reload_organization_memory

router = APIRouter(prefix="/admin", tags=["Admin"])

@router.post("/reload-memory")
async def reload_memory():
    await reload_organization_memory()
    return {"status": "success", "message": "Organization memory reloaded from files"}

