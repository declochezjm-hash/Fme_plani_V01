import type { Feature, FeatureCollection, Geometry } from 'geojson';
import initSqlJs, { type Database, type QueryExecResult, type SqlValue } from 'sql.js';
import type { EtlDataset, ReaderContext } from '../etl.types';
import { toArrayBuffer } from './binary.utils';
import { parseGpkgGeometry } from './gpkg-geometry.utils';

let sqlJsPromise: ReturnType<typeof initSqlJs> | null = null;

async function getSqlJs(): Promise<ReturnType<typeof initSqlJs>> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: (file) => `https://sql.js.org/dist/${file}`,
    });
  }
  return sqlJsPromise;
}

function cellToString(value: SqlValue | undefined): string | undefined {
  if (value == null || typeof value === 'boolean') {
    return undefined;
  }
  return String(value);
}

function resolveFeatureTable(db: Database, tableName?: string): string {
  if (tableName) {
    return tableName;
  }

  const contents = db.exec(
    "SELECT table_name FROM gpkg_contents WHERE data_type = 'features' ORDER BY table_name LIMIT 1",
  );
  const fromContents = cellToString(contents[0]?.values?.[0]?.[0]);
  if (fromContents) {
    return fromContents;
  }

  const geomCols = db.exec(
    'SELECT table_name FROM gpkg_geometry_columns ORDER BY table_name LIMIT 1',
  );
  const fromGeom = cellToString(geomCols[0]?.values?.[0]?.[0]);
  if (fromGeom) {
    return fromGeom;
  }

  throw new Error('Aucune table vectorielle dans le GeoPackage.');
}

function resolveGeometryColumn(db: Database, table: string): string {
  const rows = db.exec(
    `SELECT column_name FROM gpkg_geometry_columns WHERE table_name = '${table.replace(/'/g, "''")}' LIMIT 1`,
  );
  const column = cellToString(rows[0]?.values?.[0]?.[0]);
  if (column) {
    return column;
  }
  return 'geom';
}

function rowToFeature(
  columns: string[],
  row: SqlValue[],
  geometryColumn: string,
  table: string,
  index: number,
): Feature {
  const properties: Record<string, unknown> = { _gpkg_table: table, _row: index };
  let geometry: Geometry | null = null;

  columns.forEach((column, columnIndex) => {
    const value = row[columnIndex];
    if (column === geometryColumn) {
      geometry = parseGpkgGeometry(value);
      return;
    }
    if (value != null && typeof value !== 'object') {
      properties[column] = value;
    }
  });

  return {
    type: 'Feature',
    properties,
    geometry: geometry ?? { type: 'Point', coordinates: [0, 0] },
  };
}

function queryFeatures(db: Database, table: string, geometryColumn: string): Feature[] {
  const escapedTable = table.replace(/"/g, '""');
  const rows = db.exec(`SELECT * FROM "${escapedTable}" LIMIT 5000`);
  const result: QueryExecResult | undefined = rows[0];

  if (!result?.values?.length) {
    throw new Error(`Table « ${table} » vide ou inaccessible.`);
  }

  return result.values.map((row, index) =>
    rowToFeature(result.columns, row, geometryColumn, table, index),
  );
}

async function readWithSqlJs(buffer: ArrayBuffer, tableName?: string): Promise<FeatureCollection> {
  const SQL = await getSqlJs();
  const db = new SQL.Database(new Uint8Array(buffer));

  try {
    const table = resolveFeatureTable(db, tableName);
    const geometryColumn = resolveGeometryColumn(db, table);
    const features = queryFeatures(db, table, geometryColumn);
    return { type: 'FeatureCollection', features };
  } finally {
    db.close();
  }
}

export async function readGeoPackage(context: ReaderContext): Promise<EtlDataset> {
  const config = context.node.config;

  if (config['inline'] && !config['fileBase64']) {
    const collection = config['inline'] as FeatureCollection;
    return {
      collection,
      srid: Number(config['srid'] ?? context.defaultSrid),
      meta: { format: 'geopackage', mode: 'inline_fallback', featureCount: collection.features.length },
    };
  }

  const fileBase64 = config['fileBase64'] ?? config['arrayBuffer'];
  const buffer = toArrayBuffer(fileBase64);
  const tableName = typeof config['table'] === 'string' ? config['table'] : undefined;

  const collection = await readWithSqlJs(buffer, tableName);

  return {
    collection,
    srid: Number(config['srid'] ?? context.defaultSrid),
    meta: {
      format: 'geopackage',
      mode: 'sqljs-wasm',
      featureCount: collection.features.length,
      table: tableName,
    },
  };
}
