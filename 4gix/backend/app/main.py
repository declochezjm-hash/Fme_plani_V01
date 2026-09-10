from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import execution, nodes_catalog
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name, version=__version__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = settings.api_prefix
app.include_router(nodes_catalog.router, prefix=api)
app.include_router(execution.router, prefix=api)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "4gix-backend", "version": __version__}
