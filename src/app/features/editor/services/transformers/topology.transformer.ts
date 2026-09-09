import { cleanCoords } from '@turf/clean-coords';
import { kinks } from '@turf/kinks';
import { unkinkPolygon } from '@turf/unkink-polygon';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { EtlDataset, TransformerContext } from '../etl.types';

function healFeature(feature: Feature, heal: boolean): Feature[] {
  if (!feature.geometry) {
    return [feature];
  }

  let current = feature;

  try {
    const cleaned = cleanCoords(current);
    if (cleaned) {
      current = cleaned as Feature;
    }
  } catch {
    // ignore clean failure
  }

  if (!heal || (current.geometry.type !== 'Polygon' && current.geometry.type !== 'MultiPolygon')) {
    const issues = current.geometry.type === 'Polygon' || current.geometry.type === 'MultiPolygon'
      ? kinks(current.geometry as Polygon).features.length
      : 0;

    return [
      {
        ...current,
        properties: {
          ...current.properties,
          _topology_valid: issues === 0,
          _topology_kinks: issues,
        },
      },
    ];
  }

  try {
    const unknunked = unkinkPolygon(current.geometry as Polygon);
    return unknunked.features.map((part, index) => ({
      type: 'Feature',
      properties: {
        ...current.properties,
        _topology_healed: true,
        _topology_part: index,
        _topology_valid: true,
      },
      geometry: part.geometry,
    }));
  } catch {
    return [
      {
        ...current,
        properties: {
          ...current.properties,
          _topology_valid: false,
          _topology_healed: false,
        },
      },
    ];
  }
}

export function topologyDataset(context: TransformerContext): EtlDataset {
  const heal = context.node.config['heal'] !== false;
  const features = context.input.collection.features.flatMap((feature) => healFeature(feature, heal));
  const invalidCount = features.filter((f) => f.properties?.['_topology_valid'] === false).length;

  const collection: FeatureCollection = { type: 'FeatureCollection', features };

  return {
    collection,
    srid: context.input.srid,
    meta: {
      ...context.input.meta,
      topologyHealed: heal,
      invalidRemaining: invalidCount,
      featureCount: features.length,
    },
  };
}
