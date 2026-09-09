import type { FeatureCollection } from 'geojson';
import type { EtlDataset, ReaderContext } from '../etl.types';

function parseGeoJson(raw: unknown): FeatureCollection {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

  if (!data || typeof data !== 'object') {
    throw new Error('GeoJSON invalide.');
  }

  const typed = data as FeatureCollection;
  if (typed.type === 'FeatureCollection' && Array.isArray(typed.features)) {
    return typed;
  }

  if ((data as { type?: string }).type === 'Feature') {
    return { type: 'FeatureCollection', features: [data as FeatureCollection['features'][0]] };
  }

  if ((data as { type?: string }).type && (data as { coordinates?: unknown }).coordinates) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: data as FeatureCollection['features'][0]['geometry'],
        },
      ],
    };
  }

  throw new Error('Format GeoJSON non reconnu.');
}

export async function readGeoJson(context: ReaderContext): Promise<EtlDataset> {
  const config = context.node.config;
  let collection: FeatureCollection;

  if (config['inline']) {
    collection = parseGeoJson(config['inline']);
  } else if (config['text'] && typeof config['text'] === 'string') {
    collection = parseGeoJson(config['text']);
  } else if (config['url'] && typeof config['url'] === 'string') {
    const response = await fetch(config['url']);
    if (!response.ok) {
      throw new Error(`Impossible de charger ${config['url']}`);
    }
    collection = parseGeoJson(await response.json());
  } else {
    throw new Error('Aucune source GeoJSON configurée (inline, text ou url).');
  }

  const srid = Number(config['srid'] ?? context.defaultSrid);

  return {
    collection,
    srid,
    meta: { format: 'geojson', featureCount: collection.features.length },
  };
}
