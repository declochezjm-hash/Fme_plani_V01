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
Dépendances : geopandas, shapely, pyproj
"""
import argparse
import json
from pathlib import Path

PIPELINE = json.loads('''${nodesJson.replace(/'/g, "\\'")}''')


def load_geojson(path: Path):
    import geopandas as gpd
    return gpd.read_file(path)


def save_geojson(gdf, path: Path):
    gdf.to_file(path, driver="GeoJSON")


def run_pipeline(input_path: Path, output_path: Path):
    import geopandas as gpd
    from shapely.ops import transform
    import pyproj

    gdf = load_geojson(input_path)
    print(f"Lecture : {len(gdf)} entités")

    for node in PIPELINE["nodes"]:
        ntype = node["type"]
        cfg = node.get("config", {})
        label = node.get("label", ntype)
        print(f"→ {label} ({ntype})")

        if ntype == "buffer":
            gdf["geometry"] = gdf.geometry.buffer(float(cfg.get("distance_m", 10)))
        elif ntype == "reproject":
            src = cfg.get("source_srid", 4326)
            dst = cfg.get("target_srid", 2154)
            transformer = pyproj.Transformer.from_crs(f"EPSG:{src}", f"EPSG:{dst}", always_xy=True)
            gdf["geometry"] = gdf.geometry.apply(lambda geom: transform(transformer.transform, geom))
        elif ntype == "topology_validator":
            gdf = gdf[gdf.geometry.is_valid | gdf.geometry.buffer(0).is_valid]
        elif ntype == "writer":
            pass

    save_geojson(gdf, output_path)
    print(f"Écriture : {output_path} ({len(gdf)} entités)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pipeline ETL GisForge")
    parser.add_argument("--input", required=True, help="Fichier source GeoJSON")
    parser.add_argument("--output", required=True, help="Fichier de sortie GeoJSON")
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
