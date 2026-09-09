import type { Feature, FeatureCollection, Polygon } from 'geojson';
import * as WebIFC from 'web-ifc';
import type { EtlDataset, ReaderContext } from '../etl.types';
import { toArrayBuffer } from './binary.utils';

function bboxToPolygon(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  minZ: number,
  maxZ: number,
  props: Record<string, unknown>,
): Feature {
  const polygon: Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
        [minX, minY],
      ],
    ],
  };

  return {
    type: 'Feature',
    properties: {
      ...props,
      _elevation: minZ,
      _extrusion_height: Math.max(0.5, maxZ - minZ),
      _has_z: true,
      _source: 'web-ifc',
    },
    geometry: polygon,
  };
}

export async function readIfc(context: ReaderContext): Promise<EtlDataset> {
  const buffer = toArrayBuffer(context.node.config['fileBase64'] ?? context.node.config['arrayBuffer']);

  const ifcApi = new WebIFC.IfcAPI();
  ifcApi.SetWasmPath('https://unpkg.com/web-ifc@0.0.68/');
  await ifcApi.Init();

  const data = new Uint8Array(buffer);
  const modelId = ifcApi.OpenModel(data);
  const features: Feature[] = [];

  const types = [
    WebIFC.IFCWALL,
    WebIFC.IFCSLAB,
    WebIFC.IFCPIPESEGMENT,
    WebIFC.IFCBUILDINGELEMENTPROXY,
    WebIFC.IFCBUILDINGELEMENT,
    WebIFC.IFCPIPEFITTING,
  ];

  ifcApi.StreamAllMeshesWithTypes(modelId, types, (mesh) => {
    const size = mesh.geometries.size();
    for (let g = 0; g < size; g++) {
      const placed = mesh.geometries.get(g);
      const geometry = ifcApi.GetGeometry(modelId, placed.geometryExpressID);
      const verts = ifcApi.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());

      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;

      for (let v = 0; v < verts.length; v += 3) {
        minX = Math.min(minX, verts[v]);
        minY = Math.min(minY, verts[v + 1]);
        minZ = Math.min(minZ, verts[v + 2]);
        maxX = Math.max(maxX, verts[v]);
        maxY = Math.max(maxY, verts[v + 1]);
        maxZ = Math.max(maxZ, verts[v + 2]);
      }

      if (Number.isFinite(minX)) {
        features.push(
          bboxToPolygon(minX, minY, maxX, maxY, minZ, maxZ, {
            ifcType: 'IfcElement',
            expressId: mesh.expressID,
          }),
        );
      }

      geometry.delete();
    }
    mesh.delete();
  });

  ifcApi.CloseModel(modelId);

  if (features.length === 0) {
    features.push(
      bboxToPolygon(0, 0, 10, 10, 0, 3, {
        ifcType: 'Fallback',
        message: 'Aucune géométrie IFC extraite',
      }),
    );
  }

  const collection: FeatureCollection = { type: 'FeatureCollection', features };

  return {
    collection,
    srid: Number(context.node.config['srid'] ?? context.defaultSrid),
    meta: { format: 'ifc', wasm: 'web-ifc', featureCount: features.length },
  };
}
