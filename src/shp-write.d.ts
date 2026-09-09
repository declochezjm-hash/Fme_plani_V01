declare module '@mapbox/shp-write' {
  import type { FeatureCollection } from 'geojson';

  interface ShpWrite {
    zip: (geojson: FeatureCollection, options?: { folder?: string }) => { base64: string };
  }

  const shpwrite: ShpWrite;
  export default shpwrite;
}
