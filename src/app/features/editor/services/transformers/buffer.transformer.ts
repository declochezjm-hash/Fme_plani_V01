import { buffer as turfBuffer } from '@turf/buffer';
import type { Feature, FeatureCollection } from 'geojson';
import type { EtlDataset, TransformerContext } from '../etl.types';

export function bufferDataset(context: TransformerContext): EtlDataset {
  const distanceM = Number(context.node.config['distance_m'] ?? 50);
  const distanceKm = distanceM / 1000;

  const features: Feature[] = context.input.collection.features.flatMap((feature) => {
    if (!feature.geometry) {
      return [];
    }

    const buffered = turfBuffer(feature, distanceKm, { units: 'kilometers', steps: 8 });
    if (!buffered) {
      return [];
    }

    return [
      {
        ...buffered,
        properties: {
          ...feature.properties,
          ...buffered.properties,
          _buffer_m: distanceM,
        },
      },
    ];
  });

  const collection: FeatureCollection = { type: 'FeatureCollection', features };

  return {
    collection,
    srid: context.input.srid,
    meta: {
      ...context.input.meta,
      bufferMeters: distanceM,
      featureCount: features.length,
    },
  };
}
