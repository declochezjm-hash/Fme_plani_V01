"""Sérialisation des sorties nœuds pour l'API / fenêtre Output Data."""

from __future__ import annotations

from typing import Any

import pandas as pd

try:
    import geopandas as gpd
except ImportError:  # pragma: no cover
    gpd = None  # type: ignore


def serialize_dataframe(df: pd.DataFrame, preview_rows: int = 50) -> dict[str, Any]:
    preview = df.head(preview_rows)
    return {
        "kind": "tabular",
        "row_count": len(df),
        "columns": list(df.columns),
        "preview": preview.to_dict(orient="records"),
        "payload": df,
    }


def serialize_geodataframe(gdf: "gpd.GeoDataFrame", preview_rows: int = 50) -> dict[str, Any]:
    if gdf is None or gpd is None:
        raise RuntimeError("GeoPandas requis pour les données spatiales")
    attrs = gdf.drop(columns=gdf.geometry.name, errors="ignore")
    preview = attrs.head(preview_rows)
    return {
        "kind": "spatial",
        "row_count": len(gdf),
        "columns": list(attrs.columns),
        "crs": str(gdf.crs) if gdf.crs else None,
        "geometry_type": gdf.geometry.geom_type.mode().iloc[0] if len(gdf) else None,
        "preview": preview.to_dict(orient="records"),
        "payload": gdf,
    }


def serialize_output(raw: Any, preview_rows: int = 50) -> dict[str, Any]:
    if gpd is not None and isinstance(raw, gpd.GeoDataFrame):
        return serialize_geodataframe(raw, preview_rows=preview_rows)
    if isinstance(raw, pd.DataFrame):
        return serialize_dataframe(raw, preview_rows=preview_rows)
    if isinstance(raw, dict) and "payload" in raw:
        return raw
    return {"kind": "json", "preview": raw, "payload": raw}


def ui_snapshot(serialized: dict[str, Any]) -> dict[str, Any]:
    """Version sans payload lourd pour WebSocket / REST."""
    return {k: v for k, v in serialized.items() if k != "payload"}
