import type { FeatureCollection } from "geojson";
import shp from "shpjs";
import type { EtlDataset, ReaderContext } from "../etl.types";
import { toArrayBuffer } from "./binary.utils";

function readShapefileBuffer(context: ReaderContext): ArrayBuffer {
	const source =
		context.node.config["fileBase64"] ?? context.node.config["arrayBuffer"];
	if (!source) {
		const fileName = context.node.config["sourceFileName"];
		const hint = fileName ? ` « ${fileName} »` : "";
		throw new Error(
			`Shapefile${hint} : importez une archive .zip (.shp + .dbf + .shx) via glisser-déposer ou le panneau du nœud lecteur.`,
		);
	}

	try {
		return toArrayBuffer(source);
	} catch {
		throw new Error(
			"Shapefile : le fichier .zip est manquant ou invalide. Réimportez une archive .zip complète.",
		);
	}
}

async function parseShapefile(buffer: ArrayBuffer): Promise<FeatureCollection> {
	try {
		const parsed = await shp(buffer);
		if (Array.isArray(parsed)) {
			return {
				type: "FeatureCollection",
				features: parsed.flatMap((item) => item.features),
			};
		}
		return parsed;
	} catch {
		// Fallback synchrone si le worker/WASM interne de shpjs échoue
		const parsed = await Promise.resolve(shp(buffer));
		if (Array.isArray(parsed)) {
			return {
				type: "FeatureCollection",
				features: parsed.flatMap((item) => item.features),
			};
		}
		return parsed;
	}
}

export async function readShapefile(
	context: ReaderContext,
): Promise<EtlDataset> {
	const buffer = readShapefileBuffer(context);
	const collection = await parseShapefile(buffer);
	const srid = Number(context.node.config["srid"] ?? context.defaultSrid);

	return {
		collection,
		srid,
		meta: { format: "shapefile", featureCount: collection.features.length },
	};
}
