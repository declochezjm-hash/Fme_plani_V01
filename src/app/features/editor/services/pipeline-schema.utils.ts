import type { FeatureCollection } from "geojson";
import type {
	EtlPipelineJson,
	EtlPipelineNode,
} from "../../copilot/copilot.types";
import type { NodeAttribute } from "./editor-canvas.utils";
import { getNodeAttributes } from "./editor-canvas.utils";

export function findUpstreamNode(
	nodeId: string,
	pipeline: EtlPipelineJson,
): EtlPipelineNode | null {
	const incoming = pipeline.edges.find((edge) => edge.target === nodeId);
	if (!incoming) {
		return null;
	}
	return pipeline.nodes.find((node) => node.id === incoming.source) ?? null;
}

export function resolveNodeAttributes(
	node: EtlPipelineNode,
	pipeline: EtlPipelineJson,
): NodeAttribute[] {
	const schemaAttributes = node.config["schemaAttributes"];
	if (Array.isArray(schemaAttributes) && schemaAttributes.length > 0) {
		return schemaAttributes.map((attr: { name: string; type: string }) => ({
			name: attr.name,
			type: attr.type,
		}));
	}

	const own = getNodeAttributes(node);
	if (node.type === "writer" || node.type === "reader") {
		return own;
	}

	if (own.length > 2) {
		return own;
	}

	const upstream = findUpstreamNode(node.id, pipeline);
	if (upstream) {
		return resolveNodeAttributes(upstream, pipeline);
	}

	return own;
}

export function buildSchemaPatchFromSource(
	source: EtlPipelineNode,
	pipeline: EtlPipelineJson,
): Record<string, unknown> {
	const attributes = resolveNodeAttributes(source, pipeline);
	return {
		schemaAttributes: attributes,
		inheritedFromNodeId: source.id,
		attributeMode: "automatic",
	};
}

export function propagateSchemaAlongEdge(
	pipeline: EtlPipelineJson,
	sourceId: string,
	targetId: string,
): EtlPipelineJson {
	const source = pipeline.nodes.find((node) => node.id === sourceId);
	const target = pipeline.nodes.find((node) => node.id === targetId);
	if (!source || !target) {
		return pipeline;
	}

	if (target.type === "reader") {
		return pipeline;
	}

	const patch = buildSchemaPatchFromSource(source, pipeline);
	return {
		...pipeline,
		nodes: pipeline.nodes.map((node) =>
			node.id === targetId
				? { ...node, config: { ...node.config, ...patch } }
				: node,
		),
	};
}

export function propagateSchemaForNode(
	pipeline: EtlPipelineJson,
	targetId: string,
): EtlPipelineJson {
	const upstream = findUpstreamNode(targetId, pipeline);
	if (!upstream) {
		return pipeline;
	}
	return propagateSchemaAlongEdge(pipeline, upstream.id, targetId);
}

export function propagateSchemaForAllEdges(
	pipeline: EtlPipelineJson,
): EtlPipelineJson {
	let next = pipeline;
	for (const edge of pipeline.edges) {
		next = propagateSchemaAlongEdge(next, edge.source, edge.target);
	}
	return next;
}

export function getFeatureCollectionForNode(
	node: EtlPipelineNode,
	pipeline: EtlPipelineJson,
): FeatureCollection | null {
	const inline = node.config["inline"];
	if (
		inline &&
		typeof inline === "object" &&
		(inline as { type?: string }).type === "FeatureCollection"
	) {
		return inline as FeatureCollection;
	}

	if (node.type === "writer" || node.type !== "reader") {
		const upstream = findUpstreamNode(node.id, pipeline);
		if (upstream) {
			return getFeatureCollectionForNode(upstream, pipeline);
		}
	}

	return null;
}

export function buildAttributeTableRows(
	node: EtlPipelineNode,
	pipeline: EtlPipelineJson,
	limit = 50,
): Array<Record<string, string | number | boolean | null>> {
	const attributes = resolveNodeAttributes(node, pipeline);
	const collection = getFeatureCollectionForNode(node, pipeline);
	if (!collection || attributes.length === 0) {
		return [];
	}

	return collection.features.slice(0, limit).map((feature) => {
		const row: Record<string, string | number | boolean | null> = {};
		for (const attribute of attributes) {
			if (attribute.name === "geom") {
				row[attribute.name] = feature.geometry?.type ?? "geometry";
				continue;
			}
			const value = feature.properties?.[attribute.name];
			if (value == null) {
				row[attribute.name] = null;
			} else if (
				typeof value === "string" ||
				typeof value === "number" ||
				typeof value === "boolean"
			) {
				row[attribute.name] = value;
			} else {
				row[attribute.name] = JSON.stringify(value);
			}
		}
		return row;
	});
}

function _getNodeCategory(
	node: EtlPipelineNode,
): "reader" | "transformer" | "writer" {
	if (node.type === "reader") {
		return "reader";
	}
	if (node.type === "writer") {
		return "writer";
	}
	return "transformer";
}
