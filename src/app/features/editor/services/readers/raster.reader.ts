import type { FeatureCollection } from "geojson";
import type { EtlDataset, ReaderContext } from "../etl.types";

export async function readRaster(context: ReaderContext): Promise<EtlDataset> {
	const config = context.node.config;
	const inline = config["inline"];

	if (
		inline &&
		typeof inline === "object" &&
		(inline as { type?: string }).type === "FeatureCollection"
	) {
		const srid = Number(
			config["srid"] ?? config["sourceSrid"] ?? context.defaultSrid,
		);
		const collection = inline as FeatureCollection;
		return {
			collection,
			srid,
			meta: {
				format: "raster",
				rasterMeta: config["rasterMeta"] ?? {},
				featureCount: collection.features.length,
			},
		};
	}

	throw new Error(
		"Raster : métadonnées manquantes. Réimportez le fichier image ou l'archive ZIP depuis le panneau lecteur.",
	);
}
