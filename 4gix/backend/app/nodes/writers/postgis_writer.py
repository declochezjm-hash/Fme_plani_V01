from typing import Any, Dict

import geopandas as gpd
from sqlalchemy import create_engine

from app.nodes.base import Base4GIxNode
from app.nodes.serialization import serialize_output


class PostGisWriterNode(Base4GIxNode):
    node_type = "4gix.writers.postgis"
    category = "Writer"
    is_spatial = True
    label = "PostGIS Writer"
    description = "Charge un GeoDataFrame dans une table PostGIS."

    def execute(self, inputs: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
        connection_url = params.get("connection_url") or params.get("database_url")
        table = params.get("table")
        if not connection_url or not table:
            raise ValueError("connection_url et table requis")

        main = inputs.get("main")
        payload = main.get("payload") if isinstance(main, dict) else main
        if not isinstance(payload, gpd.GeoDataFrame):
            raise TypeError("GeoDataFrame attendu")

        if_exists = params.get("if_exists", "replace")
        engine = create_engine(connection_url)
        payload.to_postgis(table, engine, if_exists=if_exists, index=False)

        return serialize_output(
            {
                "kind": "artifact",
                "table": table,
                "row_count": len(payload),
                "message": f"Table {table} mise à jour ({len(payload)} lignes)",
            }
        )
