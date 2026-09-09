import type { FeatureCollection } from "geojson";
import type {
	ShapefileAttributeField,
	ShapefileFieldType,
} from "./shapefile.types";

const DBF_FIELD_TERMINATOR = 0x0d;

export function parseDbfSchema(
	dbfBuffer: ArrayBuffer,
): ShapefileAttributeField[] {
	const view = new DataView(dbfBuffer);
	if (dbfBuffer.byteLength < 32) {
		return [];
	}

	const headerLength = view.getUint16(8, true);
	const fields: ShapefileAttributeField[] = [];
	let offset = 32;

	while (offset + 32 <= headerLength && offset + 32 <= dbfBuffer.byteLength) {
		if (view.getUint8(offset) === DBF_FIELD_TERMINATOR) {
			break;
		}

		const nameBytes = new Uint8Array(dbfBuffer, offset, 11);
		const name = new TextDecoder("ascii")
			.decode(nameBytes)
			.replace(/\0/g, "")
			.trim();
		const dbfType = String.fromCharCode(view.getUint8(offset + 11));
		const length = view.getUint8(offset + 16);
		const decimals = view.getUint8(offset + 17);

		if (name) {
			fields.push({
				name,
				type: mapDbfType(dbfType),
				dbfType,
				length,
				decimals,
			});
		}

		offset += 32;
	}

	return fields;
}

export function mapDbfType(dbfType: string): ShapefileFieldType {
	switch (dbfType.toUpperCase()) {
		case "N":
		case "F":
		case "O":
		case "I":
		case "Y":
		case "B":
			return "number";
		case "D":
		case "T":
			return "date";
		case "L":
			return "boolean";
		default:
			return "string";
	}
}

export function inferSchemaFromCollection(
	collection: FeatureCollection,
): ShapefileAttributeField[] {
	const keys = new Set<string>();
	for (const feature of collection.features.slice(0, 25)) {
		for (const key of Object.keys(feature.properties ?? {})) {
			keys.add(key);
		}
	}

	return [...keys].map((name) => ({
		name,
		type: inferPropertyType(collection, name),
	}));
}

function inferPropertyType(
	collection: FeatureCollection,
	name: string,
): ShapefileFieldType {
	for (const feature of collection.features.slice(0, 25)) {
		const value = feature.properties?.[name];
		if (value == null) {
			continue;
		}
		if (typeof value === "boolean") {
			return "boolean";
		}
		if (typeof value === "number") {
			return "number";
		}
		if (typeof value === "string") {
			if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
				return "date";
			}
			return "string";
		}
	}
	return "string";
}

export function withGeometryField(
	attributes: ShapefileAttributeField[],
): ShapefileAttributeField[] {
	const withoutGeom = attributes.filter(
		(field) => field.name.toLowerCase() !== "geom",
	);
	return [...withoutGeom, { name: "geom", type: "geometry", dbfType: "G" }];
}

export function toUserAttributeDefs(
	attributes: ShapefileAttributeField[],
): Array<{
	name: string;
	type: string;
	value?: string;
}> {
	return attributes.map((field) => ({
		name: field.name,
		type: field.type,
		value: "",
	}));
}
