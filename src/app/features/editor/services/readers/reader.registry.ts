import type { EtlDataset, ReaderContext, ReaderFormat } from '../etl.types';
import { readGeoJson } from './geojson.reader';
import { readGeoPackage } from './geopackage.reader';
import { readCsv, readJson } from './csv-json.reader';
import { readIfc } from './ifc.reader';
import { readShapefile } from './shapefile.reader';

export async function readDataset(context: ReaderContext): Promise<EtlDataset> {
  const format = String(context.node.config['format'] ?? 'geojson') as ReaderFormat;

  switch (format) {
    case 'geojson':
      return readGeoJson(context);
    case 'shapefile':
      return readShapefile(context);
    case 'geopackage':
      return readGeoPackage(context);
    case 'csv':
      return readCsv(context);
    case 'json':
      return readJson(context);
    case 'ifc':
      return readIfc(context);
    default:
      throw new Error(`Format de lecture inconnu : ${format}`);
  }
}
