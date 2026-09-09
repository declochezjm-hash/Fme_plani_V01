import { featureCollection } from '@turf/helpers';
import { intersect } from '@turf/intersect';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { EtlDataset, TransformerContext } from '../etl.types';

function asClipFeature(raw: unknown): Feature | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Feature;
  if (candidate.type === 'Feature' && candidate.geometry) {
    return candidate;
  }

  const geometryCandidate = raw as { type?: string; geometry?: Feature['geometry'] };
  if (geometryCandidate.geometry) {
    return { type: 'Feature', properties: {}, geometry: geometryCandidate.geometry };
  }

  return null;
}

export function clipDataset(context: TransformerContext): EtlDataset {
  const clipFeature = asClipFeature(context.node.config['clipGeometry']);

  if (!clipFeature) {
    return {
      ...context.input,
      meta: {
        ...context.input.meta,
        clipped: false,
        clipSkipped: 'no_clip_geometry',
      },
    };
  }

  const features: Feature[] = [];

  for (const feature of context.input.collection.features) {
    if (!feature.geometry) {
      continue;
    }

    try {
      const sourceFeature: Feature<Polygon | MultiPolygon> = {
        type: 'Feature',
        properties: feature.properties ?? {},
        geometry: feature.geometry as Polygon | MultiPolygon,
      };
      const clipped = intersect(
        featureCollection([
          sourceFeature,
          clipFeature as Feature<Polygon | MultiPolygon>,
        ]),
        { properties: feature.properties ?? {} },
      );

      if (clipped?.geometry) {
        features.push({
          ...feature,
          geometry: clipped.geometry,
          properties: { ...feature.properties, ...clipped.properties },
        });
      }
    } catch {
      // ignore invalid clip pairs
    }
  }

  const collection: FeatureCollection = { type: 'FeatureCollection', features };

  return {
    collection,
    srid: context.input.srid,
    meta: {
      ...context.input.meta,
      clipped: true,
      featureCount: features.length,
    },
  };
}
