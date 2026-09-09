import type { Geometry } from 'geojson';

const GPKG_MAGIC = [0x47, 0x50];

function envelopeByteLength(envelopeType: number): number {
  switch (envelopeType) {
    case 1:
      return 32;
    case 2:
    case 3:
      return 48;
    case 4:
      return 64;
    default:
      return 0;
  }
}

function toBytes(value: unknown): Uint8Array | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (typeof value === 'string') {
    return null;
  }
  return new Uint8Array(value as ArrayLike<number>);
}

function parseWkbGeometry(
  view: DataView,
  startOffset: number,
): { geometry: Geometry; offset: number } | null {
  let offset = startOffset;
  if (offset + 5 > view.byteLength) {
    return null;
  }

  const littleEndian = view.getUint8(offset++) === 1;
  const typeCode = view.getUint32(offset, littleEndian);
  offset += 4;

  const hasZ = typeCode >= 1000 && typeCode < 2000;
  const hasM = typeCode >= 2000 && typeCode < 3000;
  const baseType = hasZ ? typeCode - 1000 : hasM ? typeCode - 2000 : typeCode;
  const dimensions = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);

  const readCoordinate = (): number[] => {
    const coords: number[] = [];
    for (let dimension = 0; dimension < dimensions; dimension++) {
      coords.push(view.getFloat64(offset, littleEndian));
      offset += 8;
    }
    return coords;
  };

  switch (baseType) {
    case 1:
      return { geometry: { type: 'Point', coordinates: readCoordinate() }, offset };
    case 2: {
      const pointCount = view.getUint32(offset, littleEndian);
      offset += 4;
      const coordinates: number[][] = [];
      for (let index = 0; index < pointCount; index++) {
        coordinates.push(readCoordinate());
      }
      return { geometry: { type: 'LineString', coordinates }, offset };
    }
    case 3: {
      const ringCount = view.getUint32(offset, littleEndian);
      offset += 4;
      const coordinates: number[][][] = [];
      for (let ringIndex = 0; ringIndex < ringCount; ringIndex++) {
        const pointCount = view.getUint32(offset, littleEndian);
        offset += 4;
        const ring: number[][] = [];
        for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
          ring.push(readCoordinate());
        }
        coordinates.push(ring);
      }
      return { geometry: { type: 'Polygon', coordinates }, offset };
    }
    case 4: {
      const geometryCount = view.getUint32(offset, littleEndian);
      offset += 4;
      const coordinates: number[][] = [];
      for (let index = 0; index < geometryCount; index++) {
        const parsed = parseWkbGeometry(view, offset);
        if (!parsed || parsed.geometry.type !== 'Point') {
          return null;
        }
        coordinates.push(parsed.geometry.coordinates as number[]);
        offset = parsed.offset;
      }
      return { geometry: { type: 'MultiPoint', coordinates }, offset };
    }
    case 5: {
      const geometryCount = view.getUint32(offset, littleEndian);
      offset += 4;
      const coordinates: number[][][] = [];
      for (let index = 0; index < geometryCount; index++) {
        const parsed = parseWkbGeometry(view, offset);
        if (!parsed || parsed.geometry.type !== 'LineString') {
          return null;
        }
        coordinates.push(parsed.geometry.coordinates as number[][]);
        offset = parsed.offset;
      }
      return { geometry: { type: 'MultiLineString', coordinates }, offset };
    }
    case 6: {
      const geometryCount = view.getUint32(offset, littleEndian);
      offset += 4;
      const coordinates: number[][][][] = [];
      for (let index = 0; index < geometryCount; index++) {
        const parsed = parseWkbGeometry(view, offset);
        if (!parsed || parsed.geometry.type !== 'Polygon') {
          return null;
        }
        coordinates.push(parsed.geometry.coordinates as number[][][]);
        offset = parsed.offset;
      }
      return { geometry: { type: 'MultiPolygon', coordinates }, offset };
    }
    case 7: {
      const geometryCount = view.getUint32(offset, littleEndian);
      offset += 4;
      const geometries: Geometry[] = [];
      for (let index = 0; index < geometryCount; index++) {
        const parsed = parseWkbGeometry(view, offset);
        if (!parsed) {
          return null;
        }
        geometries.push(parsed.geometry);
        offset = parsed.offset;
      }
      return { geometry: { type: 'GeometryCollection', geometries }, offset };
    }
    default:
      return null;
  }
}

export function parseGpkgGeometry(value: unknown): Geometry | null {
  const bytes = toBytes(value);
  if (!bytes || bytes.length < 8 || bytes[0] !== GPKG_MAGIC[0] || bytes[1] !== GPKG_MAGIC[1]) {
    return null;
  }

  const envelopeType = (bytes[4] >> 4) & 0x07;
  const wkbOffset = 8 + envelopeByteLength(envelopeType);
  if (wkbOffset >= bytes.length) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset + wkbOffset, bytes.byteLength - wkbOffset);
  const parsed = parseWkbGeometry(view, 0);
  return parsed?.geometry ?? null;
}
