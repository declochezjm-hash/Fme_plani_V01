from typing import Any, Dict

import geopandas as gpd
from sqlalchemy import create_engine, text

from app.nodes.base import Base4GIxNode
from app.nodes.serialization import serialize_geodataframe


class PostGisReaderNode(Base4GIxNode):
    node_type = "4gix.readers.postgis"
    category = "Reader"
    is_spatial = True
    label = "PostGIS Reader"
    description = "Lit une table ou requête SQL depuis PostGIS."

    def execute(self, inputs: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
        connection_url = params.get("connection_url") or params.get("database_url")
        if not connection_url:
            raise ValueError("connection_url requis")

        sql = params.get("sql")
        table = params.get("table")
        geom_col = params.get("geometry_column", "geom")

        engine = create_engine(connection_url)
        if sql:
            gdf = gpd.read_postgis(text(sql), engine, geom_col=geom_col)
        elif table:
            gdf = gpd.read_postgis(f'SELECT * FROM "{table}"', engine, geom_col=geom_col)
        else:
            raise ValueError("Paramètre sql ou table requis")

        return serialize_geodataframe(gdf)
