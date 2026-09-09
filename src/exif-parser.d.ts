declare module "exif-parser" {
	interface ExifTags {
		GPSLatitude?: number;
		GPSLongitude?: number;
		[key: string]: unknown;
	}

	interface ExifResult {
		tags: ExifTags;
	}

	interface ExifParser {
		parse(): ExifResult;
	}

	interface ExifParserFactory {
		create(buffer: ArrayBuffer | Buffer): ExifParser;
	}

	const exifParser: ExifParserFactory;
	export default exifParser;
}
