declare module 'shpjs' {
  import type { FeatureCollection } from 'geojson';

  function shp(input: ArrayBuffer | string): Promise<FeatureCollection | FeatureCollection[]>;
  export default shp;
}
