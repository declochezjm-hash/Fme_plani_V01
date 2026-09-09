import type { Feature, Position } from 'geojson';
import proj4 from 'proj4';
import type { EtlDataset, TransformerContext } from '../etl.types';

const EPSG_DEFS: Record<number, string> = {
  4326: '+proj=longlat +datum=WGS84 +no_defs',
  2154:
    '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  3857: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs',
};

function ensureProjection(epsg: number): string {
  const key = `EPSG:${epsg}`;
  if (!proj4.defs(key)) {
    const def = EPSG_DEFS[epsg];
    if (!def) {
      throw new Error(`EPSG:${epsg} non supporté — ajoutez la définition proj4.`);
    }
    proj4.defs(key, def);
  }
  return key;
}

function transformCoords(coords: unknown, from: string, to: string): unknown {
  if (!Array.isArray(coords)) {
    return coords;
  }

  if (typeof coords[0] === 'number') {
    const pair = coords as Position;
    const result = proj4(from, to, [pair[0], pair[1]]) as [number, number];
    return pair.length > 2 ? [result[0], result[1], pair[2]] : result;
  }

  return coords.map((child) => transformCoords(child, from, to));
}

function reprojectFeature(feature: Feature, from: string, to: string): Feature {
  if (!feature.geometry || feature.geometry.type === 'GeometryCollection') {
    return feature;
  }

  const geometry = feature.geometry as Exclude<Feature['geometry'], null | undefined> & {
    coordinates: unknown;
  };

  return {
    ...feature,
    geometry: {
      ...geometry,
      coordinates: transformCoords(geometry.coordinates, from, to),
    } as Feature['geometry'],
  };
}

export function reprojectDataset(context: TransformerContext): EtlDataset {
  const sourceSrid = Number(context.node.config['source_srid'] ?? context.input.srid);
  const targetSrid = Number(context.node.config['target_srid'] ?? context.defaultSrid);

  const from = ensureProjection(sourceSrid);
  const to = ensureProjection(targetSrid);

  const features = context.input.collection.features.map((feature) =>
    reprojectFeature(feature, from, to),
  );

  return {
    collection: { type: 'FeatureCollection', features },
    srid: targetSrid,
    meta: {
      ...context.input.meta,
      reprojectedFrom: sourceSrid,
      reprojectedTo: targetSrid,
    },
  };
}
