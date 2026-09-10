from fastapi import APIRouter

from app.nodes.registry import list_node_catalog

router = APIRouter(prefix="/nodes", tags=["nodes"])


@router.get("/catalog")
def nodes_catalog() -> list[dict]:
    return list_node_catalog()
