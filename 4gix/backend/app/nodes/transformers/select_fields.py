from typing import Any, Dict

import geopandas as gpd
import pandas as pd

from app.nodes.base import Base4GIxNode
from app.nodes.serialization import serialize_dataframe, serialize_geodataframe


class SelectFieldsNode(Base4GIxNode):
    node_type = "4gix.transformers.select_fields"
    category = "Transformer"
    is_spatial = False
    label = "Select Fields"
    description = "Conserve un sous-ensemble de colonnes."

    def execute(self, inputs: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
        columns = params.get("columns") or []
        if not columns:
            raise ValueError("columns requis")

        main = inputs.get("main")
        if main is None:
            raise ValueError("Entrée main manquante")

        payload = main.get("payload") if isinstance(main, dict) else main
        if isinstance(payload, gpd.GeoDataFrame):
            geom_name = payload.geometry.name
            keep = [c for c in columns if c in payload.columns or c == geom_name]
            gdf = payload[keep]
            return serialize_geodataframe(gdf)
        if isinstance(payload, pd.DataFrame):
            df = payload[[c for c in columns if c in payload.columns]]
            return serialize_dataframe(df)
        raise TypeError("Entrée tabulaire attendue")
