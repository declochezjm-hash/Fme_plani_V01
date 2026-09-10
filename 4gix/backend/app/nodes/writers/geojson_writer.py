from pathlib import Path
from typing import Any, Dict

import geopandas as gpd

from app.nodes.base import Base4GIxNode
from app.nodes.serialization import serialize_output


class GeoJsonWriterNode(Base4GIxNode):
    node_type = "4gix.writers.geojson"
    category = "Writer"
    is_spatial = True
    label = "GeoJSON Writer"
    description = "Écrit un GeoDataFrame en fichier GeoJSON."

    def execute(self, inputs: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
        path = params.get("path")
        if not path:
            raise ValueError("path requis")

        main = inputs.get("main")
        payload = main.get("payload") if isinstance(main, dict) else main
        if not isinstance(payload, gpd.GeoDataFrame):
            raise TypeError("GeoDataFrame attendu")

        out = Path(path)
        out.parent.mkdir(parents=True, exist_ok=True)
        payload.to_file(out, driver="GeoJSON")

        return serialize_output(
            {
                "kind": "artifact",
                "path": str(out),
                "row_count": len(payload),
                "message": f"GeoJSON écrit ({len(payload)} entités)",
            }
        )
