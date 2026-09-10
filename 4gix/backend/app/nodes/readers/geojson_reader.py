from pathlib import Path
from typing import Any, Dict

import geopandas as gpd

from app.nodes.base import Base4GIxNode
from app.nodes.serialization import serialize_geodataframe


class GeoJsonReaderNode(Base4GIxNode):
    node_type = "4gix.readers.geojson"
    category = "Reader"
    is_spatial = True
    label = "GeoJSON Reader"
    description = "Charge un fichier GeoJSON."

    def execute(self, inputs: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
        path = params.get("path")
        if not path:
            raise ValueError("path requis")
        gdf = gpd.read_file(Path(path))
        return serialize_geodataframe(gdf)
