import { Injectable } from "@angular/core";
import { applyHierarchicalLayout } from "@app/core/services/importers/fmw-hierarchy-layout.utils";
import type {
	EtlPipelineEdge,
	EtlPipelineJson,
	EtlPipelineNode,
} from "@app/features/copilot/copilot.types";
import type {
	CopilotActionChip,
	FileInspectionResult,
	InspectedFileCategory,
} from "./file-inspection.types";

@Injectable({ providedIn: "root" })
export class CopilotWorkflowService {
	buildActionChips(inspection: FileInspectionResult): CopilotActionChip[] {
		switch (inspection.category) {
			case "vector":
				return [
					{
						id: "buffer",
						label: "Zone tampon (Buffer)",
						prompt: "Créer un buffer de 50 mètres",
					},
					{
						id: "reproject_2154",
						label: "Reprojection EPSG:2154",
						prompt: "Reprojeter vers Lambert-93",
					},
					{
						id: "export_postgis",
						label: "Export PostGIS",
						prompt: "Exporter vers PostGIS",
					},
					{
						id: "export_geojson",
						label: "Export GeoJSON",
						prompt: "Exporter en GeoJSON",
					},
					{
						id: "attribute_filter",
						label: "Filtrage attributaire",
						prompt: "Filtrer les entités par attribut",
					},
				];
			case "tabular":
				return [
					{
						id: "xy_to_points",
						label: "Convertir X/Y en points",
						prompt: "Convertir les colonnes X/Y en géométries ponctuelles",
					},
					{
						id: "dedupe",
						label: "Nettoyer les doublons",
						prompt: "Supprimer les doublons attributaires",
					},
					{
						id: "spatial_join",
						label: "Jointure spatiale",
						prompt: "Préparer une jointure spatiale",
					},
					{
						id: "export_geojson",
						label: "Export GeoJSON",
						prompt: "Exporter en GeoJSON",
					},
				];
			case "raster":
				return [
					{
						id: "clip_extent",
						label: "Découper par emprise",
						prompt: "Découper le raster par emprise",
					},
					{
						id: "vectorize",
						label: "Vectoriser les contours",
						prompt: "Vectoriser les contours du raster",
					},
					{
						id: "export_geojson",
						label: "Export GeoJSON",
						prompt: "Exporter le résultat en GeoJSON",
					},
				];
			default:
				return [
					{
						id: "export_geojson",
						label: "Export GeoJSON",
						prompt: "Exporter en GeoJSON",
					},
				];
		}
	}

	buildPipeline(
		inspection: FileInspectionResult,
		actionId: string,
	): EtlPipelineJson {
		const reader = this.buildReaderNode(inspection);
		const transformers = this.buildTransformers(inspection.category, actionId);
		const writer = this.buildWriterNode(actionId);

		const nodes: EtlPipelineNode[] = [reader, ...transformers, writer];
		const edges: EtlPipelineEdge[] = [];
		let previousId = reader.id;

		transformers.forEach((node, index) => {
			edges.push({ id: `edge-${index}`, source: previousId, target: node.id });
			previousId = node.id;
		});

		edges.push({
			id: `edge-${edges.length}`,
			source: previousId,
			target: writer.id,
		});

		applyHierarchicalLayout(nodes, edges);

		return { version: 1, nodes, edges };
	}

	private buildReaderNode(inspection: FileInspectionResult): EtlPipelineNode {
		const format =
			inspection.readerFormat ?? this.defaultReaderFormat(inspection.category);
		const config: Record<string, unknown> = { format };

		if (format === "csv" && inspection.coordinateFields) {
			config["latField"] = inspection.coordinateFields.y ?? "lat";
			config["lonField"] = inspection.coordinateFields.x ?? "lon";
		}

		if (inspection.layers[0]) {
			config["table"] = inspection.layers[0];
			config["tableName"] = inspection.layers[0];
		}

		return {
			id: "reader-smart",
			type: "reader",
			label: `Lecture ${inspection.format}`,
			config,
			position: { x: 0, y: 0 },
		};
	}

	private buildTransformers(
		category: InspectedFileCategory,
		actionId: string,
	): EtlPipelineNode[] {
		const nodes: EtlPipelineNode[] = [];

		if (
			category === "tabular" &&
			(actionId === "xy_to_points" || actionId === "spatial_join")
		) {
			nodes.push({
				id: "transform-xy",
				type: "topology_validator",
				label: "Points X/Y",
				config: {
					heal: true,
					conditions: [
						{ attribute: "geom", operator: "is_not_null", value: "" },
					],
				},
				position: { x: 0, y: 0 },
			});
		}

		if (actionId === "buffer") {
			nodes.push({
				id: "transform-buffer",
				type: "buffer",
				label: "Tampon 50 m",
				config: { distance_m: 50 },
				position: { x: 0, y: 0 },
			});
		}

		if (actionId === "reproject_2154") {
			nodes.push({
				id: "transform-reproject",
				type: "reproject",
				label: "EPSG:2154",
				config: { source_srid: 4326, target_srid: 2154 },
				position: { x: 0, y: 0 },
			});
		}

		if (actionId === "attribute_filter" || actionId === "dedupe") {
			nodes.push({
				id: "transform-filter",
				type: "tester",
				label:
					actionId === "dedupe" ? "Filtre doublons" : "Filtre attributaire",
				config: {
					conditions: [
						{
							attribute: inspectionAttributeName(category),
							operator: "is_not_null",
							value: "",
						},
					],
				},
				position: { x: 0, y: 0 },
			});
		}

		if (actionId === "clip_extent" || actionId === "vectorize") {
			nodes.push({
				id: "transform-clip",
				type: "clip",
				label: actionId === "vectorize" ? "Vectorisation" : "Découpage emprise",
				config: {},
				position: { x: 0, y: 0 },
			});
			if (actionId === "vectorize") {
				nodes.push({
					id: "transform-topology",
					type: "topology_validator",
					label: "Nettoyage géométries",
					config: { heal: true },
					position: { x: 0, y: 0 },
				});
			}
		}

		if (
			category === "vector" &&
			nodes.length === 0 &&
			actionId !== "export_postgis" &&
			actionId !== "export_geojson"
		) {
			nodes.push({
				id: "transform-topology",
				type: "topology_validator",
				label: "Validation topologie",
				config: { heal: true },
				position: { x: 0, y: 0 },
			});
		}

		return nodes;
	}

	private buildWriterNode(actionId: string): EtlPipelineNode {
		const postgis = actionId === "export_postgis";
		return {
			id: "writer-smart",
			type: "writer",
			label: postgis ? "Sortie PostGIS" : "Sortie GeoJSON",
			config: {
				format: postgis ? "postgis" : "geojson",
				tableName: "features",
				schema: "$(PG_SCHEMA)",
			},
			position: { x: 0, y: 0 },
		};
	}

	private defaultReaderFormat(category: InspectedFileCategory): string {
		if (category === "tabular") {
			return "csv";
		}
		if (category === "raster") {
			return "raster";
		}
		return "geojson";
	}
}

function inspectionAttributeName(category: InspectedFileCategory): string {
	if (category === "tabular") {
		return "id";
	}
	return "name";
}
