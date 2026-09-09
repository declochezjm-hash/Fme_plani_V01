import type { FeatureCollection } from 'geojson';
import type { EtlDataset, ReaderContext } from '../etl.types';

/**
 * STUB IFC/BIM — prêt pour branchement web-ifc / WASM Rust (Sprint 3+).
 */
export async function readIfc(context: ReaderContext): Promise<EtlDataset> {
  const wasmReady = context.node.config['wasmModule'] === 'web-ifc';

  const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          source: 'ifc-stub',
          wasmReady,
          message: 'Parseur IFC/BIM — intégration WASM à venir',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [2.35, 48.85],
              [2.36, 48.85],
              [2.36, 48.86],
              [2.35, 48.86],
              [2.35, 48.85],
            ],
          ],
        },
      },
    ],
  };

  return {
    collection,
    srid: Number(context.node.config['srid'] ?? context.defaultSrid),
    meta: {
      format: 'ifc',
      stub: true,
      featureCount: 1,
    },
  };
}
