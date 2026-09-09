import Papa from 'papaparse';
import type { Feature, FeatureCollection } from 'geojson';
import type { EtlDataset, ReaderContext } from '../etl.types';

function rowsToFeatures(
  rows: Record<string, unknown>[],
  latField: string,
  lonField: string,
): Feature[] {
  const features: Feature[] = [];

  rows.forEach((row, index) => {
    const lat = Number(row[latField]);
    const lon = Number(row[lonField]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }

    const properties = { ...row };
    delete properties[latField];
    delete properties[lonField];

    features.push({
      type: 'Feature',
      properties: { ...properties, _row: index },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    });
  });

  return features;
}

export async function readCsv(context: ReaderContext): Promise<EtlDataset> {
  const text = context.node.config['text'];
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('CSV : collez le contenu ou importez un fichier.');
  }

  const latField = String(context.node.config['latField'] ?? 'lat');
  const lonField = String(context.node.config['lonField'] ?? 'lon');
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message ?? 'Erreur de parsing CSV.');
  }

  const features = rowsToFeatures(parsed.data, latField, lonField);
  const collection: FeatureCollection = { type: 'FeatureCollection', features };

  return {
    collection,
    srid: Number(context.node.config['srid'] ?? context.defaultSrid),
    meta: { format: 'csv', featureCount: features.length },
  };
}

export async function readJson(context: ReaderContext): Promise<EtlDataset> {
  const raw = context.node.config['text'] ?? context.node.config['inline'];
  if (!raw) {
    throw new Error('JSON : aucune donnée fournie.');
  }

  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

  if (data?.type === 'FeatureCollection') {
    return {
      collection: data as FeatureCollection,
      srid: Number(context.node.config['srid'] ?? context.defaultSrid),
      meta: { format: 'json', featureCount: data.features.length },
    };
  }

  if (Array.isArray(data)) {
    const features: Feature[] = data.map((item, index) => {
      if (item?.type === 'Feature') {
        return item as Feature;
      }
      if (item?.lat !== undefined && item?.lon !== undefined) {
        return {
          type: 'Feature',
          properties: { ...item, _row: index },
          geometry: { type: 'Point', coordinates: [Number(item.lon), Number(item.lat)] },
        } satisfies Feature;
      }
      return {
        type: 'Feature',
        properties: { value: item, _row: index },
        geometry: { type: 'Point', coordinates: [0, 0] },
      } satisfies Feature;
    });

    return {
      collection: { type: 'FeatureCollection', features },
      srid: Number(context.node.config['srid'] ?? context.defaultSrid),
      meta: { format: 'json', featureCount: features.length },
    };
  }

  throw new Error('JSON : format non reconnu (FeatureCollection ou tableau attendu).');
}
