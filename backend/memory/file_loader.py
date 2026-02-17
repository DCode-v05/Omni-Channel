import asyncio
from pathlib import Path
from memory.organization_memory import organization_memory

KNOWLEDGE_BASE_DIR = Path(__file__).parent / "knowledge_base"

async def initialize_organization_memory_from_files():
    await organization_memory.load_from_directory(str(KNOWLEDGE_BASE_DIR))

async def reload_organization_memory():
    await organization_memory.reload_from_directory(str(KNOWLEDGE_BASE_DIR))

if __name__ == "__main__":
    asyncio.run(initialize_organization_memory_from_files())

