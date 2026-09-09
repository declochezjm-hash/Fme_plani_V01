import type { FeatureCollection } from 'geojson';
import type { EtlDataset, ReaderContext } from '../etl.types';

/**
 * GeoPackage — lecture légère via sql.js/WASM prévue Sprint 3.
 * Sprint 2 : stub avec détection d'en-tête SQLite + message explicite,
 * ou lecture GeoJSON embarqué si fourni en fallback.
 */
export async function readGeoPackage(context: ReaderContext): Promise<EtlDataset> {
  const config = context.node.config;

  if (config['inline']) {
    const collection = config['inline'] as FeatureCollection;
    return {
      collection,
      srid: Number(config['srid'] ?? context.defaultSrid),
      meta: {
        format: 'geopackage',
        mode: 'inline_fallback',
        featureCount: collection.features?.length ?? 0,
      },
    };
  }

  const fileBase64 = config['fileBase64'];
  if (typeof fileBase64 === 'string') {
    const header = atob(fileBase64.slice(0, 32));
    if (!header.startsWith('SQLite format 3')) {
      throw new Error('Fichier GeoPackage invalide (en-tête SQLite attendu).');
    }

    throw new Error(
      'GeoPackage binaire détecté. Le parseur WASM complet arrive au Sprint 3 — importez via GeoJSON ou Shapefile pour l\'instant.',
    );
  }

  throw new Error('GeoPackage : fournissez un fichier .gpkg (base64) ou un GeoJSON inline en fallback.');
}
