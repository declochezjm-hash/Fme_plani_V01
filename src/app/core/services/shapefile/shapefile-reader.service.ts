import { Injectable, inject } from "@angular/core";
import type { FeatureCollection } from "geojson";
import shp from "shpjs";
import { ZipExtractorService } from "../zip/zip-extractor.service";
import {
	inferSchemaFromCollection,
	parseDbfSchema,
	toUserAttributeDefs,
	withGeometryField,
} from "./dbf-schema.utils";
import type {
	ShapefileAttributeField,
	ShapefileReadResult,
} from "./shapefile.types";

@Injectable({ providedIn: "root" })
export class ShapefileReaderService {
	private readonly zipExtractor = inject(ZipExtractorService);

	async readFromZipFile(file: File): Promise<ShapefileReadResult> {
		const buffer = await file.arrayBuffer();
		return this.readFromZipBuffer(buffer, file.name);
	}

	async readFromZipBuffer(
		buffer: ArrayBuffer,
		archiveName: string,
	): Promise<ShapefileReadResult> {
		const extraction = await this.zipExtractor.extractFromBuffer(
			buffer,
			archiveName,
		);
		if (extraction.kind !== "shapefile") {
			throw new Error(
				"Archive ZIP shapefile invalide : .shp, .dbf et .shx requis.",
			);
		}

		const collection = await this.parseShapefileCollection(buffer);
		const layerName =
			extraction.shapefileBaseName ?? archiveName.replace(/\.zip$/i, "");
		const dbfEntry =
			extraction.entries.find(
				(entry) =>
					entry.extension === "dbf" &&
					entry.name.replace(/\.dbf$/i, "").toLowerCase() ===
						layerName.toLowerCase(),
			) ?? extraction.entries.find((entry) => entry.extension === "dbf");

		const dbfFields = dbfEntry ? parseDbfSchema(dbfEntry.data) : [];
		const attributes = withGeometryField(
			dbfFields.length > 0 ? dbfFields : inferSchemaFromCollection(collection),
		);

		return {
			layerName,
			archiveName,
			collection,
			attributes,
			featureCount: collection.features.length,
			fileBase64: this.arrayBufferToBase64(buffer),
		};
	}

	async inspectZipBuffer(
		buffer: ArrayBuffer,
		archiveName: string,
	): Promise<ShapefileReadResult> {
		return this.readFromZipBuffer(buffer, archiveName);
	}

	toReaderConfig(result: ShapefileReadResult): Record<string, unknown> {
		const userAttributes = toUserAttributeDefs(result.attributes);
		return {
			format: "shapefile",
			fileBase64: result.fileBase64,
			sourceFileName: result.archiveName,
			tableName: result.layerName,
			inline: result.collection,
			userAttributes,
			schemaAttributes: result.attributes.map((field) => ({
				name: field.name,
				type: field.type,
			})),
			attributeMode: "automatic",
			featureCount: result.featureCount,
		};
	}

	attributesToInspection(
		attributes: ShapefileAttributeField[],
	): Array<{ name: string; type: string }> {
		return attributes.map((field) => ({ name: field.name, type: field.type }));
	}

	private async parseShapefileCollection(
		buffer: ArrayBuffer,
	): Promise<FeatureCollection> {
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

	private arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = "";
		const chunkSize = 0x8000;
		for (let i = 0; i < bytes.length; i += chunkSize) {
			binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
		}
		return btoa(binary);
	}
}
