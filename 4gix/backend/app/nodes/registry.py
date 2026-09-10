from typing import Type

from app.nodes.base import Base4GIxNode
from app.nodes.readers.file_reader import FileReaderNode
from app.nodes.readers.geojson_reader import GeoJsonReaderNode
from app.nodes.readers.postgis_reader import PostGisReaderNode
from app.nodes.transformers.reproject import ReprojectNode
from app.nodes.transformers.select_fields import SelectFieldsNode
from app.nodes.writers.geojson_writer import GeoJsonWriterNode
from app.nodes.writers.postgis_writer import PostGisWriterNode

NODE_REGISTRY: dict[str, Type[Base4GIxNode]] = {
    PostGisReaderNode.node_type: PostGisReaderNode,
    FileReaderNode.node_type: FileReaderNode,
    GeoJsonReaderNode.node_type: GeoJsonReaderNode,
    SelectFieldsNode.node_type: SelectFieldsNode,
    ReprojectNode.node_type: ReprojectNode,
    GeoJsonWriterNode.node_type: GeoJsonWriterNode,
    PostGisWriterNode.node_type: PostGisWriterNode,
}


def get_node_class(node_type: str) -> Type[Base4GIxNode]:
    if node_type not in NODE_REGISTRY:
        raise KeyError(f"Type de nœud inconnu: {node_type}")
    return NODE_REGISTRY[node_type]


def list_node_catalog() -> list[dict]:
    items: list[dict] = []
    for node_type, cls in NODE_REGISTRY.items():
        instance = cls()
        items.append(
            {
                "type": node_type,
                "category": cls.category,
                "is_spatial": cls.is_spatial,
                "label": getattr(instance, "label", node_type),
                "description": getattr(instance, "description", ""),
            }
        )
    return items
