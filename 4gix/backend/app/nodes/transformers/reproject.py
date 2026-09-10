from typing import Any, Dict

import geopandas as gpd

from app.nodes.base import Base4GIxNode
from app.nodes.serialization import serialize_geodataframe


class ReprojectNode(Base4GIxNode):
    node_type = "4gix.transformers.reproject"
    category = "Transformer"
    is_spatial = True
    label = "Reproject"
    description = "Reprojette un GeoDataFrame vers un CRS cible."

    def execute(self, inputs: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
        target_crs = params.get("target_crs") or params.get("crs")
        if not target_crs:
            raise ValueError("target_crs requis")

        main = inputs.get("main")
        if main is None:
            raise ValueError("Entrée main manquante")
        payload = main.get("payload") if isinstance(main, dict) else main
        if not isinstance(payload, gpd.GeoDataFrame):
            raise TypeError("GeoDataFrame attendu")

        gdf = payload.to_crs(target_crs)
        return serialize_geodataframe(gdf)
