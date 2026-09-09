import shp from 'shpjs';
import type { FeatureCollection } from 'geojson';
import type { EtlDataset, ReaderContext } from '../etl.types';

function toArrayBuffer(input: unknown): ArrayBuffer {
  if (input instanceof ArrayBuffer) {
    return input;
  }

  if (typeof input === 'string') {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  throw new Error('Shapefile : fournissez un fichier .zip encodé en base64.');
}

export async function readShapefile(context: ReaderContext): Promise<EtlDataset> {
  const buffer = toArrayBuffer(context.node.config['fileBase64'] ?? context.node.config['arrayBuffer']);
  const parsed = await shp(buffer);
  const collection: FeatureCollection = Array.isArray(parsed)
    ? { type: 'FeatureCollection', features: parsed.flatMap((item) => item.features) }
    : parsed;

  const srid = Number(context.node.config['srid'] ?? context.defaultSrid);

  return {
    collection,
    srid,
    meta: { format: 'shapefile', featureCount: collection.features.length },
  };
}
