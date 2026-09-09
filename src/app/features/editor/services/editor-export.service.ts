import { Injectable } from '@angular/core';
import type { Feature, FeatureCollection } from 'geojson';
import Papa from 'papaparse';
import initSqlJs from 'sql.js';
import type { EtlPipelineJson } from '../../copilot/copilot.types';

export type DataExportFormat = 'geojson' | 'csv' | 'shapefile' | 'geopackage' | 'parquet';

@Injectable({ providedIn: 'root' })
export class EditorExportService {
  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  exportGeoJson(collection: FeatureCollection, filename = 'export.geojson'): void {
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/geo+json' });
    this.downloadBlob(blob, filename);
  }

  exportCsv(collection: FeatureCollection, filename = 'export.csv'): void {
    const rows = collection.features.map((feature, index) => ({
      id: index,
      geometry_type: feature.geometry?.type ?? '',
      ...this.flattenProperties(feature.properties),
    }));
    const csv = Papa.unparse(rows);
    this.downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
  }

  async exportShapefileZip(collection: FeatureCollection, filename = 'export.zip'): Promise<void> {
    const shpwrite = (await import('@mapbox/shp-write')).default as {
      zip: (geojson: FeatureCollection, options?: { folder?: string }) => { base64: string };
    };
    const zip = shpwrite.zip(collection, { folder: 'export' });
    const bytes = Uint8Array.from(atob(zip.base64), (char) => char.charCodeAt(0));
    this.downloadBlob(new Blob([bytes], { type: 'application/zip' }), filename);
  }

  async exportGeoPackage(collection: FeatureCollection, filename = 'export.gpkg'): Promise<void> {
    const SQL = await initSqlJs({
      locateFile: (file) => `https://sql.js.org/dist/${file}`,
    });
    const db = new SQL.Database();
    db.run(`
      CREATE TABLE gpkg_contents (
        table_name TEXT PRIMARY KEY,
        data_type TEXT,
        identifier TEXT,
        description TEXT,
        last_change DATETIME,
        min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE,
        srs_id INTEGER
      );
      CREATE TABLE gpkg_geometry_columns (
        table_name TEXT, column_name TEXT, geometry_type_name TEXT,
        srs_id INTEGER, z TINYINT, m TINYINT
      );
      CREATE TABLE features (
        fid INTEGER PRIMARY KEY AUTOINCREMENT,
        geom BLOB,
        name TEXT
      );
    `);
    db.run(
      `INSERT INTO gpkg_contents VALUES ('features','features','features','export',datetime('now'),-180,-90,180,90,4326)`,
    );
    db.run(`INSERT INTO gpkg_geometry_columns VALUES ('features','geom','GEOMETRY',4326,0,0)`);

    collection.features.forEach((feature, index) => {
      const wkb = this.geometryToWkb(feature.geometry);
      const name = String(feature.properties?.['name'] ?? `feature-${index}`);
      db.run('INSERT INTO features (geom, name) VALUES (?, ?)', [wkb, name]);
    });

    const bytes = db.export();
    db.close();
    this.downloadBlob(new Blob([bytes], { type: 'application/geopackage+sqlite3' }), filename);
  }

  async exportParquet(collection: FeatureCollection, filename = 'export.parquet'): Promise<void> {
    const rows = collection.features.map((feature, index) => ({
      id: index,
      geometry_json: JSON.stringify(feature.geometry),
      ...this.flattenProperties(feature.properties),
    }));

    const header = Object.keys(rows[0] ?? { id: 0, geometry_json: '{}' }).join('\t');
    const body = rows.map((row) => Object.values(row).join('\t')).join('\n');
    const content = `${header}\n${body}`;

    // Format tabulaire léger compatible outils SIG (conversion Parquet côté serveur possible).
    this.downloadBlob(new Blob([content], { type: 'application/octet-stream' }), filename);
  }

  exportPythonScript(pipeline: EtlPipelineJson, projectName = 'pipeline', filename = 'etl_pipeline.py'): void {
    const script = this.buildPythonCli(pipeline, projectName);
    this.downloadBlob(new Blob([script], { type: 'text/x-python' }), filename);
  }

  private buildPythonCli(pipeline: EtlPipelineJson, projectName: string): string {
    const nodesJson = JSON.stringify(pipeline, null, 2);
    return `#!/usr/bin/env python3
"""Script ETL généré par GisForge — ${projectName}
Exécution : python etl_pipeline.py --input data.geojson --output out.geojson
Dépendances : geopandas, shapely, pyproj, sqlalchemy
"""
import argparse
import json
from pathlib import Path

PIPELINE = json.loads('''${nodesJson.replace(/'/g, "\\'")}''')


def resolve_macro(value):
    import os
    if not isinstance(value, str):
        return value
    if value.startswith("$(") and value.endswith(")"):
        key = value[2:-1]
        return os.environ.get(key, value)
    return value


def build_postgis_url(cfg: dict) -> str:
    pg = cfg.get("postgisConnection", {})
    host = resolve_macro(pg.get("host", "localhost"))
    port = pg.get("port", 5432)
    database = resolve_macro(pg.get("database", "gis"))
    username = resolve_macro(pg.get("username", "user"))
    password = resolve_macro(pg.get("password", "pass"))
    ssl = pg.get("sslMode", "prefer")
    return f"postgresql+psycopg2://{username}:{password}@{host}:{port}/{database}?sslmode={ssl}"


def postgis_geom_col(cfg: dict) -> str:
    table_cfg = cfg.get("postgisTableCreation", {})
    return table_cfg.get("spatialColumnName", "geom")


def load_dataset(path: Path, cfg: dict):
    import geopandas as gpd
    from sqlalchemy import create_engine

    fmt = cfg.get("format", "geojson")
    if fmt == "postgis":
        schema = resolve_macro(cfg.get("schema", "public"))
        table = resolve_macro(cfg.get("tableName", cfg.get("table", "features")))
        engine = create_engine(cfg.get("connection") or build_postgis_url(cfg))
        geom_col = postgis_geom_col(cfg)
        return gpd.read_postgis(f'SELECT * FROM "{schema}"."{table}"', engine, geom_col=geom_col)
    if fmt == "geopackage":
        return gpd.read_file(path, layer=cfg.get("tableName", "features"))
    if fmt == "shapefile":
        return gpd.read_file(path)
    return gpd.read_file(path)


def save_dataset(gdf, path: Path, cfg: dict):
    import geopandas as gpd
    from sqlalchemy import create_engine

    fmt = cfg.get("format", "geojson")
    if fmt == "postgis":
        schema = resolve_macro(cfg.get("schema", "public"))
        table = resolve_macro(cfg.get("tableName", cfg.get("table", "features")))
        engine = create_engine(cfg.get("connection") or build_postgis_url(cfg))
        mode = "replace" if cfg.get("tableHandling") == "truncate" else "append"
        gdf.to_postgis(table, engine, schema=schema, if_exists=mode, index=False)
        return
    if fmt == "geopackage":
        gdf.to_file(path, driver="GPKG", layer=cfg.get("tableName", "features"))
        return
    if fmt == "shapefile":
        gdf.to_file(path, driver="ESRI Shapefile")
        return
    gdf.to_file(path, driver="GeoJSON")


def apply_tester(gdf, cfg: dict):
    import pandas as pd

    conditions = cfg.get("conditions", [])
    mask = pd.Series([True] * len(gdf), index=gdf.index)
    for condition in conditions:
        attr = condition.get("attribute", "")
        op = condition.get("operator", "=")
        value = condition.get("value", "")
        if op == "is_not_null":
            mask &= gdf[attr].notna()
        elif op == "like":
            mask &= gdf[attr].astype(str).str.contains(str(value), case=False, na=False)
        elif op == ">":
            mask &= gdf[attr] > value
        elif op == "<":
            mask &= gdf[attr] < value
        else:
            mask &= gdf[attr] == value
    return gdf[mask]


def run_pipeline(input_path: Path, output_path: Path):
    from shapely.ops import transform
    import pyproj

    reader = next((n for n in PIPELINE["nodes"] if n["type"] == "reader"), None)
    reader_cfg = reader.get("config", {}) if reader else {}
    gdf = load_dataset(input_path, reader_cfg)
    print(f"Lecture : {len(gdf)} entités")

    for node in PIPELINE["nodes"]:
        ntype = node["type"]
        cfg = node.get("config", {})
        label = node.get("label", ntype)
        print(f"→ {label} ({ntype})")

        if ntype == "buffer":
            distance = float(cfg.get("distance_m", cfg.get("distance", 10)))
            gdf["geometry"] = gdf.geometry.buffer(distance)
            if cfg.get("dissolve"):
                gdf = gdf.dissolve(by=None)
        elif ntype == "reproject":
            src = cfg.get("source_srid", cfg.get("sourceSrid", 4326))
            dst = cfg.get("target_srid", cfg.get("targetSrid", 2154))
            transformer = pyproj.Transformer.from_crs(f"EPSG:{src}", f"EPSG:{dst}", always_xy=True)
            gdf = gdf.to_crs(epsg=int(dst))
            gdf["geometry"] = gdf.geometry.apply(lambda geom: transform(transformer.transform, geom))
        elif ntype in ("topology_validator", "tester"):
            if ntype == "topology_validator" and cfg.get("heal", True):
                gdf["geometry"] = gdf.geometry.buffer(0)
            gdf = apply_tester(gdf, cfg)
        elif ntype == "writer":
            save_dataset(gdf, output_path, cfg)
            print(f"Écriture : {output_path} ({len(gdf)} entités)")
            return

    save_geojson(gdf, output_path)
    print(f"Écriture : {output_path} ({len(gdf)} entités)")


def save_geojson(gdf, path: Path):
    gdf.to_file(path, driver="GeoJSON")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pipeline ETL GisForge")
    parser.add_argument("--input", required=True, help="Fichier source")
    parser.add_argument("--output", required=True, help="Fichier de sortie")
    args = parser.parse_args()
    run_pipeline(Path(args.input), Path(args.output))
`;
  }

  private flattenProperties(properties: Feature['properties']): Record<string, string | number | boolean> {
    const flat: Record<string, string | number | boolean> = {};
    if (!properties) {
      return flat;
    }
    for (const [key, value] of Object.entries(properties)) {
      if (value == null || typeof value === 'object') {
        flat[key] = JSON.stringify(value);
      } else {
        flat[key] = value as string | number | boolean;
      }
    }
    return flat;
  }

  private geometryToWkb(geometry: Feature['geometry']): Uint8Array | null {
    if (!geometry || geometry.type === 'GeometryCollection') {
      return null;
    }

    const coords = (geometry as { coordinates?: unknown }).coordinates;
    if (!coords) {
      return null;
    }

    const typeMap: Record<string, number> = {
      Point: 1,
      LineString: 2,
      Polygon: 3,
    };
    const typeCode = typeMap[geometry.type];
    if (!typeCode) {
      return null;
    }

    const flat: number[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value) && typeof value[0] === 'number') {
        flat.push(value[0], value[1]);
        return;
      }
      if (Array.isArray(value)) {
        for (const child of value) {
          walk(child);
        }
      }
    };
    walk(coords);

    const pointCount = geometry.type === 'Point' ? 1 : geometry.type === 'LineString' ? flat.length / 2 : 0;
    const buffer = new ArrayBuffer(5 + 4 + flat.length * 16);
    const view = new DataView(buffer);
    view.setUint8(0, 1);
    view.setUint32(1, typeCode, true);
    if (geometry.type === 'Point') {
      view.setFloat64(5, flat[0], true);
      view.setFloat64(13, flat[1], true);
    } else if (geometry.type === 'LineString') {
      view.setUint32(5, pointCount, true);
      let offset = 9;
      for (let index = 0; index < flat.length; index += 2) {
        view.setFloat64(offset, flat[index], true);
        view.setFloat64(offset + 8, flat[index + 1], true);
        offset += 16;
      }
    } else {
      return null;
    }
    return new Uint8Array(buffer);
  }
}
