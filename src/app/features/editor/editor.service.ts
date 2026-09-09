import { computed, Injectable, inject, signal } from "@angular/core";
import { AuthService } from "@app/core/auth/auth.service";
import { PipelineFileService } from "@app/core/services/copilot/pipeline-file.service";
import { ExecutionLoggerService } from "@app/core/services/execution-logger.service";
import { ProjectImportService } from "@app/core/services/importers/project-import.service";
import type { MapRasterOverlay } from "@app/core/services/raster/raster.types";
import type { Json } from "@app/core/supabase/database.types";
import { SupabaseService } from "@app/core/supabase/supabase.service";
import { formatErrorMessage } from "@app/core/utils/error.utils";
import { CopilotService } from "../copilot/copilot.service";
import type {
	EtlPipelineGroup,
	EtlPipelineJson,
	EtlPipelineNode,
} from "../copilot/copilot.types";
import type {
	CreateProjectDto,
	EtlProject,
	UpdateProjectDto,
} from "./editor.types";
import {
	GROUP_COLOR_PALETTE,
	GROUP_MIN_SIZE,
	type NodeAttribute,
} from "./services/editor-canvas.utils";
import {
	DEFAULT_DEMO_PIPELINE,
	NODE_CATALOG,
	type PipelineRunResult,
} from "./services/etl.types";
import { PipelineExecutionService } from "./services/pipeline-execution.service";
import { PipelineRunnerService } from "./services/pipeline-runner.service";
import {
	buildAttributeTableRows,
	propagateSchemaAlongEdge,
	propagateSchemaForAllEdges,
	resolveNodeAttributes,
} from "./services/pipeline-schema.utils";

const EMPTY_PIPELINE: EtlPipelineJson = {
	version: 1,
	nodes: [],
	edges: [],
};

const EDITOR_DEMO_STORAGE_KEYS = [
	"gisforge-demo-pipeline",
	"gisforge-editor-pipeline-cache",
	"gisforge-editor-canvas-state",
] as const;

const EDITOR_GROUPS_MIGRATION_KEY = "gisforge-editor-groups-v2";

export interface AddGroupOptions {
	panX: number;
	panY: number;
	aroundNode?: EtlPipelineNode;
}

@Injectable({ providedIn: "root" })
export class EditorService {
	private readonly supabase = inject(SupabaseService).client;
	private readonly auth = inject(AuthService);
	private readonly runner = inject(PipelineRunnerService);
	private readonly execution = inject(PipelineExecutionService);
	private readonly copilot = inject(CopilotService);
	private readonly projectImport = inject(ProjectImportService);
	private readonly executionLoggerService = inject(ExecutionLoggerService);
	private readonly pipelineFile = inject(PipelineFileService);

	constructor() {
		this.purgeCorruptedDemoStorage();
	}

	private readonly _projects = signal<EtlProject[]>([]);
	private readonly _activeProjectId = signal<string | null>(null);
	private readonly _canvasPipeline = signal<EtlPipelineJson>(EMPTY_PIPELINE);
	private readonly _selectedNodeId = signal<string | null>(null);
	private readonly _selectedEdgeId = signal<string | null>(null);
	private readonly _loading = signal(false);
	private readonly _saving = signal(false);
	private readonly _running = signal(false);
	private readonly _lastRunResult = signal<PipelineRunResult | null>(null);
	private readonly _assistantReply = signal<string | null>(null);
	private readonly _lastError = signal<string | null>(null);

	readonly projects = this._projects.asReadonly();
	readonly activeProjectId = this._activeProjectId.asReadonly();
	readonly canvasPipeline = this._canvasPipeline.asReadonly();
	readonly selectedNodeId = this._selectedNodeId.asReadonly();
	readonly selectedEdgeId = this._selectedEdgeId.asReadonly();
	readonly loading = this._loading.asReadonly();
	readonly saving = this._saving.asReadonly();
	readonly running = this._running.asReadonly();
	readonly lastRunResult = this._lastRunResult.asReadonly();
	readonly assistantReply = this._assistantReply.asReadonly();
	readonly lastError = this._lastError.asReadonly();
	readonly executionProgress = this.execution.progress;
	readonly executionStatus = this.execution.status;

	readonly activeProject = computed(() => {
		const id = this._activeProjectId();
		if (!id) {
			return null;
		}
		return this._projects().find((project) => project.id === id) ?? null;
	});

	readonly pipeline = computed<EtlPipelineJson>(() => this._canvasPipeline());

	readonly selectedNodeAttributes = computed<NodeAttribute[]>(() => {
		const node = this.selectedNode();
		return node ? resolveNodeAttributes(node, this._canvasPipeline()) : [];
	});

	readonly selectedNodeAttributeRows = computed(() => {
		const node = this.selectedNode();
		return node ? buildAttributeTableRows(node, this._canvasPipeline()) : [];
	});

	readonly selectedNode = computed(() => {
		const id = this._selectedNodeId();
		if (!id) {
			return null;
		}
		return this._canvasPipeline().nodes.find((node) => node.id === id) ?? null;
	});

	readonly workspacePreview = computed(() => {
		const result = this._lastRunResult();
		if (result?.output?.collection) {
			return result.output.collection;
		}

		const reader = this._canvasPipeline().nodes.find(
			(node) => node.type === "reader",
		);
		return this.previewFromNodeConfig(reader?.config ?? null);
	});

	readonly workspaceRasterOverlay = computed(() =>
		this.rasterOverlayFromPipeline(),
	);

	readonly selectedNodePreview = computed(() => {
		const nodeId = this._selectedNodeId();
		const result = this._lastRunResult();
		if (nodeId && result?.intermediates[nodeId]) {
			return result.intermediates[nodeId].collection;
		}

		const node = this.selectedNode();
		if (node?.type === "reader") {
			const preview = this.previewFromNodeConfig(node.config);
			if (preview) {
				return preview;
			}
		}

		return result?.output?.collection ?? null;
	});

	readonly selectedNodeRasterOverlay = computed(() => {
		const node = this.selectedNode();
		if (node?.type === "reader") {
			return this.rasterOverlayFromConfig(node.config);
		}
		return this.workspaceRasterOverlay();
	});

	setActiveProject(projectId: string | null): void {
		this._activeProjectId.set(projectId);
		const project = this._projects().find((item) => item.id === projectId);
		this._canvasPipeline.set(this.normalizePipeline(project?.pipeline_config));
		this._selectedNodeId.set(null);
		this._lastRunResult.set(null);
	}

	ensureDemoPipelineOnLoad(): void {
		if (this._canvasPipeline().nodes.length === 0) {
			this._canvasPipeline.set(this.cloneDemoPipeline());
		}
	}

	private normalizePipeline(
		config: EtlPipelineJson | undefined | null,
	): EtlPipelineJson {
		if (!config?.nodes?.length) {
			return this.cloneDemoPipeline();
		}
		return this.sanitizeGroups(config);
	}

	private purgeCorruptedDemoStorage(): void {
		if (typeof localStorage === "undefined") {
			return;
		}

		try {
			if (localStorage.getItem(EDITOR_GROUPS_MIGRATION_KEY)) {
				return;
			}

			for (const key of EDITOR_DEMO_STORAGE_KEYS) {
				localStorage.removeItem(key);
			}

			localStorage.setItem(EDITOR_GROUPS_MIGRATION_KEY, "1");
		} catch {
			// localStorage indisponible (SSR, mode privé, etc.)
		}
	}

	private sanitizeGroups(pipeline: EtlPipelineJson): EtlPipelineJson {
		const groups = (pipeline.groups ?? []).map((group, index) => ({
			...group,
			position: {
				x: group.position?.x ?? 100 + index * 80,
				y: group.position?.y ?? 100 + index * 80,
			},
			size: {
				width: Math.max(GROUP_MIN_SIZE, group.size?.width ?? 400),
				height: Math.max(GROUP_MIN_SIZE, group.size?.height ?? 250),
			},
		}));

		const seen = new Set<string>();
		const dedupedGroups = groups.filter((group) => {
			if (seen.has(group.id)) {
				return false;
			}
			seen.add(group.id);
			return true;
		});

		const validGroupIds = new Set(dedupedGroups.map((group) => group.id));

		return {
			...pipeline,
			groups: dedupedGroups,
			nodes: pipeline.nodes.map((node) =>
				node.groupId && !validGroupIds.has(node.groupId)
					? { ...node, groupId: undefined }
					: node,
			),
		};
	}

	private cloneDemoPipeline(): EtlPipelineJson {
		const pipeline = JSON.parse(
			JSON.stringify(DEFAULT_DEMO_PIPELINE),
		) as EtlPipelineJson;
		return this.sanitizeGroups(pipeline);
	}

	selectNode(nodeId: string | null): void {
		this._selectedNodeId.set(nodeId);
		if (nodeId) {
			this._selectedEdgeId.set(null);
		}
	}

	selectEdge(edgeId: string | null): void {
		this._selectedEdgeId.set(edgeId);
		if (edgeId) {
			this._selectedNodeId.set(null);
		}
	}

	injectPipeline(pipeline: EtlPipelineJson): void {
		const remapped = this.remapPipelineIds(pipeline);
		const withSchemas = propagateSchemaForAllEdges(remapped);
		this._canvasPipeline.set(withSchemas);
		this._selectedNodeId.set(withSchemas.nodes[0]?.id ?? null);
		this._lastRunResult.set(null);
	}

	async injectPipelineWithFile(
		pipeline: EtlPipelineJson,
		file?: File | null,
	): Promise<void> {
		const enriched = file
			? await this.pipelineFile.enrichPipelineWithFile(pipeline, file)
			: pipeline;
		this.injectPipeline(enriched);
		const readerId = this._canvasPipeline().nodes.find(
			(node) => node.type === "reader",
		)?.id;
		if (readerId) {
			this._selectedNodeId.set(readerId);
		}
	}

	async importProjectFile(file: File): Promise<string[]> {
		const result = await this.projectImport.importFile(file);
		this.injectPipeline(result.pipeline);
		this.executionLoggerService.info(
			`Projet importé depuis « ${result.sourceName} » (${result.format}).`,
		);
		for (const warning of result.warnings) {
			this.executionLoggerService.warn(warning);
		}
		return result.warnings;
	}

	async askAssistant(): Promise<void> {
		const node = this.selectedNode();
		const reply = await this.copilot.explain({
			nodeLabel: node?.label,
			nodeType: node?.type,
			nodeConfig: node?.config,
			errorMessage: this._lastError() ?? undefined,
			pipelineSummary: `${this._canvasPipeline().nodes.length} nœuds, ${this._canvasPipeline().edges.length} connexions`,
		});
		this._assistantReply.set(reply);
	}

	clearAssistantReply(): void {
		this._assistantReply.set(null);
	}

	private remapPipelineIds(pipeline: EtlPipelineJson): EtlPipelineJson {
		const idMap = new Map<string, string>();
		const groupIdMap = new Map<string, string>();

		for (const group of pipeline.groups ?? []) {
			groupIdMap.set(group.id, `group-${crypto.randomUUID().slice(0, 8)}`);
		}

		const nodes: EtlPipelineNode[] = pipeline.nodes.map((node, index) => {
			const newId = `${node.type}-${crypto.randomUUID().slice(0, 8)}`;
			idMap.set(node.id, newId);
			return {
				...node,
				id: newId,
				groupId: node.groupId
					? (groupIdMap.get(node.groupId) ?? node.groupId)
					: undefined,
				position: {
					x: node.position?.x ?? 80 + index * 220,
					y: node.position?.y ?? 120,
				},
			};
		});

		const edges = pipeline.edges.map((edge, index) => ({
			id: `edge-${index}-${crypto.randomUUID().slice(0, 6)}`,
			source: idMap.get(edge.source) ?? edge.source,
			target: idMap.get(edge.target) ?? edge.target,
			sourcePort: edge.sourcePort,
			targetPort: edge.targetPort,
		}));

		const groups = (pipeline.groups ?? []).map((group) => ({
			...group,
			id:
				groupIdMap.get(group.id) ?? `group-${crypto.randomUUID().slice(0, 8)}`,
		}));

		return { version: pipeline.version ?? 1, nodes, edges, groups };
	}

	async load(): Promise<void> {
		this._loading.set(true);
		try {
			const { data, error } = await this.supabase
				.from("projects")
				.select("*")
				.order("updated_at", { ascending: false });

			if (error) {
				throw error;
			}

			const mapped: EtlProject[] = (data ?? []).map((row) => ({
				id: row.id ?? "",
				organization_id: row.organization_id ?? "",
				name: row.name ?? "",
				description: row.description,
				default_srid: row.default_srid ?? 4326,
				pipeline_config:
					(row.pipeline_config as unknown as EtlPipelineJson) ?? EMPTY_PIPELINE,
				status: (row.status as EtlProject["status"]) ?? "draft",
				created_by: row.created_by,
				created_at: row.created_at ?? "",
				updated_at: row.updated_at ?? "",
			}));

			this._projects.set(mapped);

			const activeId = this._activeProjectId();
			if (!activeId && mapped.length > 0) {
				this.setActiveProject(mapped[0].id);
			} else if (activeId) {
				this.setActiveProject(activeId);
			} else {
				this._canvasPipeline.set(this.cloneDemoPipeline());
			}

			this.ensureDemoPipelineOnLoad();
		} finally {
			this._loading.set(false);
		}
	}

	buildDefaultProjectName(): string {
		const stamp = new Date().toLocaleString("fr-FR", {
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
		return `Projet ${stamp}`;
	}

	async create(dto: CreateProjectDto): Promise<EtlProject> {
		this._saving.set(true);
		try {
			let organizationId = this.auth.currentOrganizationId();
			if (!organizationId) {
				await this.auth.refreshProfile();
				organizationId = this.auth.currentOrganizationId();
			}
			if (!organizationId) {
				throw new Error(
					"Organisation introuvable. Reconnectez-vous après un reset Supabase (admin@default.local / 123456).",
				);
			}

			const { data, error } = await this.supabase
				.from("projects")
				.insert({
					name: dto.name,
					description: dto.description ?? null,
					default_srid: dto.default_srid ?? 4326,
					pipeline_config: (dto.pipeline_config ??
						DEFAULT_DEMO_PIPELINE) as unknown as Json,
					organization_id: organizationId,
					created_by: this.auth.userProfile()?.uid ?? null,
					status: "draft",
				})
				.select("*")
				.single();

			if (error) {
				throw new Error(
					formatErrorMessage(error, "Impossible de créer le projet."),
				);
			}

			await this.load();

			const created = this._projects().find(
				(project) => project.id === data.id,
			);
			if (created) {
				this.setActiveProject(created.id);
				return created;
			}

			throw new Error("Projet créé mais introuvable.");
		} finally {
			this._saving.set(false);
		}
	}

	async update(projectId: string, dto: UpdateProjectDto): Promise<void> {
		this._saving.set(true);
		try {
			const { pipeline_config, ...rest } = dto;
			const payload = {
				...rest,
				...(pipeline_config !== undefined
					? { pipeline_config: pipeline_config as unknown as Json }
					: {}),
			};
			const { error } = await this.supabase
				.from("projects")
				.update(payload)
				.eq("id", projectId);

			if (error) {
				throw error;
			}

			await this.load();
		} finally {
			this._saving.set(false);
		}
	}

	async saveCanvasPipeline(): Promise<void> {
		const project = this.activeProject();
		if (!project) {
			throw new Error("Aucun projet actif.");
		}
		await this.update(project.id, { pipeline_config: this._canvasPipeline() });
	}

	moveNode(nodeId: string, position: { x: number; y: number }): void {
		this._canvasPipeline.update((pipeline) => ({
			...pipeline,
			nodes: pipeline.nodes.map((node) =>
				node.id === nodeId ? { ...node, position } : node,
			),
		}));
	}

	moveGroup(groupId: string, position: { x: number; y: number }): void {
		const pipeline = this._canvasPipeline();
		const group = pipeline.groups?.find((item) => item.id === groupId);
		if (!group) {
			return;
		}

		const dx = position.x - group.position.x;
		const dy = position.y - group.position.y;

		this._canvasPipeline.update((current) => ({
			...current,
			groups: (current.groups ?? []).map((item) =>
				item.id === groupId ? { ...item, position } : item,
			),
			nodes: current.nodes.map((node) =>
				node.groupId === groupId
					? {
							...node,
							position: { x: node.position.x + dx, y: node.position.y + dy },
						}
					: node,
			),
		}));
	}

	resizeGroup(
		groupId: string,
		position: { x: number; y: number },
		size: { width: number; height: number },
	): void {
		this._canvasPipeline.update((current) => ({
			...current,
			groups: (current.groups ?? []).map((group) =>
				group.id === groupId
					? {
							...group,
							position,
							size: {
								width: Math.max(GROUP_MIN_SIZE, size.width),
								height: Math.max(GROUP_MIN_SIZE, size.height),
							},
						}
					: group,
			),
		}));
	}

	updateGroup(
		groupId: string,
		patch: Partial<Pick<EtlPipelineGroup, "label" | "color">>,
	): void {
		this._canvasPipeline.update((pipeline) => ({
			...pipeline,
			groups: (pipeline.groups ?? []).map((group) =>
				group.id === groupId ? { ...group, ...patch } : group,
			),
		}));
	}

	deleteEdge(edgeId: string): void {
		this._canvasPipeline.update((pipeline) => ({
			...pipeline,
			edges: pipeline.edges.filter((edge) => edge.id !== edgeId),
		}));
		if (this._selectedEdgeId() === edgeId) {
			this._selectedEdgeId.set(null);
		}
	}

	deleteNode(nodeId: string): void {
		this._canvasPipeline.update((pipeline) => ({
			...pipeline,
			nodes: pipeline.nodes.filter((node) => node.id !== nodeId),
			edges: pipeline.edges.filter(
				(edge) => edge.source !== nodeId && edge.target !== nodeId,
			),
		}));
		if (this._selectedNodeId() === nodeId) {
			this._selectedNodeId.set(null);
		}
	}

	detachNodeEdges(nodeId: string): void {
		this._canvasPipeline.update((pipeline) => ({
			...pipeline,
			edges: pipeline.edges.filter(
				(edge) => edge.source !== nodeId && edge.target !== nodeId,
			),
		}));
	}

	deleteGroup(groupId: string): void {
		this._canvasPipeline.update((pipeline) => ({
			...pipeline,
			groups: (pipeline.groups ?? []).filter((group) => group.id !== groupId),
			nodes: pipeline.nodes.map((node) =>
				node.groupId === groupId ? { ...node, groupId: undefined } : node,
			),
		}));
	}

	deleteGroupWithNodes(groupId: string): void {
		const pipeline = this._canvasPipeline();
		const nodeIds = new Set(
			pipeline.nodes
				.filter((node) => node.groupId === groupId)
				.map((node) => node.id),
		);

		this._canvasPipeline.update((current) => ({
			...current,
			groups: (current.groups ?? []).filter((item) => item.id !== groupId),
			nodes: current.nodes.filter((node) => !nodeIds.has(node.id)),
			edges: current.edges.filter(
				(edge) => !nodeIds.has(edge.source) && !nodeIds.has(edge.target),
			),
		}));

		const selectedNodeId = this._selectedNodeId();
		if (selectedNodeId && nodeIds.has(selectedNodeId)) {
			this._selectedNodeId.set(null);
		}
	}

	reconnectEdge(edgeId: string, targetNodeId: string): void {
		this._canvasPipeline.update((pipeline) => {
			const next = {
				...pipeline,
				edges: pipeline.edges.map((edge) =>
					edge.id === edgeId ? { ...edge, target: targetNodeId } : edge,
				),
			};
			const edge = next.edges.find((item) => item.id === edgeId);
			return edge
				? propagateSchemaAlongEdge(next, edge.source, edge.target)
				: next;
		});
	}

	reconnectEdgeSource(edgeId: string, sourceNodeId: string): void {
		this._canvasPipeline.update((pipeline) => {
			const next = {
				...pipeline,
				edges: pipeline.edges.map((edge) =>
					edge.id === edgeId ? { ...edge, source: sourceNodeId } : edge,
				),
			};
			const edge = next.edges.find((item) => item.id === edgeId);
			return edge
				? propagateSchemaAlongEdge(next, edge.source, edge.target)
				: next;
		});
	}

	addNode(catalogIndex: number): void {
		this.addNodeAt(catalogIndex, {
			x: 80 + this._canvasPipeline().nodes.length * 40,
			y: 80,
		});
	}

	addNodeAt(catalogIndex: number, position: { x: number; y: number }): void {
		const item = NODE_CATALOG[catalogIndex];
		if (!item) {
			return;
		}

		const id = `${item.type}-${crypto.randomUUID().slice(0, 8)}`;
		const node: EtlPipelineNode = {
			id,
			type: item.type,
			label: item.label,
			config: { ...item.defaultConfig },
			position: {
				x: Math.max(0, position.x - 90),
				y: Math.max(0, position.y - 30),
			},
		};

		this._canvasPipeline.update((pipeline) => ({
			...pipeline,
			nodes: [...pipeline.nodes, node],
		}));
		this._selectedNodeId.set(id);
	}

	addNodeByCategory(category: "reader" | "writer" | "transformer"): void {
		const index = NODE_CATALOG.findIndex((item) => item.category === category);
		if (index >= 0) {
			this.addNode(index);
		}
	}

	stopExecution(): void {
		this.runner.abort();
		this._running.set(false);
		this.executionLoggerService.warn(
			"Exécution interrompue par l'utilisateur.",
		);
	}

	addGroup(label = "Nouvelle étape", options?: AddGroupOptions): string {
		const index =
			(this._canvasPipeline().groups?.length ?? 0) % GROUP_COLOR_PALETTE.length;
		const position = options?.aroundNode
			? {
					x: Math.max(0, options.aroundNode.position.x - 20),
					y: Math.max(0, options.aroundNode.position.y - 40),
				}
			: {
					x: (options?.panX ?? 0) + 100,
					y: (options?.panY ?? 0) + 100,
				};

		const group: EtlPipelineGroup = {
			id: `group-${crypto.randomUUID().slice(0, 8)}`,
			label,
			color: GROUP_COLOR_PALETTE[index],
			position,
			size: { width: 400, height: 250 },
		};

		this._canvasPipeline.update((pipeline) => ({
			...pipeline,
			groups: [...(pipeline.groups ?? []), group],
		}));

		return group.id;
	}

	connectNodes(sourceId: string, targetId: string): void {
		const exists = this._canvasPipeline().edges.some(
			(edge) => edge.source === sourceId && edge.target === targetId,
		);
		if (exists) {
			return;
		}

		this._canvasPipeline.update((pipeline) => {
			const withEdge = {
				...pipeline,
				edges: [
					...pipeline.edges,
					{
						id: `edge-${crypto.randomUUID().slice(0, 8)}`,
						source: sourceId,
						target: targetId,
					},
				],
			};
			return propagateSchemaAlongEdge(withEdge, sourceId, targetId);
		});
	}

	updateNodeConfig(nodeId: string, config: Record<string, unknown>): void {
		this._canvasPipeline.update((pipeline) => ({
			...pipeline,
			nodes: pipeline.nodes.map((node) =>
				node.id === nodeId ? { ...node, config } : node,
			),
		}));
	}

	patchNodeConfig(nodeId: string, patch: Record<string, unknown>): void {
		const node = this._canvasPipeline().nodes.find(
			(item) => item.id === nodeId,
		);
		if (!node) {
			return;
		}
		this.updateNodeConfig(nodeId, { ...node.config, ...patch });
	}

	async importFileToNode(nodeId: string, file: File): Promise<void> {
		const node = this._canvasPipeline().nodes.find(
			(item) => item.id === nodeId,
		);
		if (!node) {
			return;
		}

		const readerPatch = await this.pipelineFile.buildReaderConfigFromFile(file);
		this.updateNodeConfig(nodeId, { ...node.config, ...readerPatch });
		this.syncPipelineSchemas();
	}

	private syncPipelineSchemas(): void {
		this._canvasPipeline.update((pipeline) =>
			propagateSchemaForAllEdges(pipeline),
		);
	}

	private previewFromNodeConfig(
		config: Record<string, unknown> | null,
	): import("geojson").FeatureCollection | null {
		if (!config) {
			return null;
		}
		const inline = config["inline"];
		if (
			inline &&
			typeof inline === "object" &&
			(inline as { type?: string }).type === "FeatureCollection"
		) {
			return inline as import("geojson").FeatureCollection;
		}
		return null;
	}

	private rasterOverlayFromPipeline(): MapRasterOverlay | null {
		const reader = this._canvasPipeline().nodes.find(
			(node) => node.type === "reader",
		);
		return this.rasterOverlayFromConfig(reader?.config ?? null);
	}

	private rasterOverlayFromConfig(
		config: Record<string, unknown> | null,
	): MapRasterOverlay | null {
		if (config?.["format"] !== "raster") {
			return null;
		}
		const overlay = config["rasterOverlay"];
		if (
			overlay &&
			typeof overlay === "object" &&
			typeof (overlay as { url?: unknown }).url === "string" &&
			Array.isArray((overlay as { coordinates?: unknown }).coordinates)
		) {
			return overlay as MapRasterOverlay;
		}
		const url = config["imageDataUrl"];
		const coordinates =
			config["rasterOverlayCoordinates"] ?? config["overlayCoordinates"];
		if (typeof url === "string" && Array.isArray(coordinates)) {
			return {
				url,
				coordinates: coordinates as MapRasterOverlay["coordinates"],
			};
		}
		return null;
	}

	async runPipelineLocally(): Promise<PipelineRunResult> {
		const project = this.activeProject();
		if (!project) {
			throw new Error("Aucun projet actif.");
		}

		this._running.set(true);
		this._lastError.set(null);
		this.execution.begin();
		this.executionLoggerService.begin(project.name);
		try {
			const result = await this.runner.run(
				this._canvasPipeline(),
				project.default_srid,
				{
					onProgress: (update) => {
						const node = this._canvasPipeline().nodes.find(
							(item) => item.id === update.nodeId,
						);
						this.executionLoggerService.info(update.message, {
							nodeId: update.nodeId,
							nodeLabel: node?.label,
						});
					},
				},
			);
			this._lastRunResult.set(result);
			for (const line of result.logs) {
				this.executionLoggerService.info(line);
			}
			this.executionLoggerService.finish({
				rowsRead: result.metrics.rowsRead,
				rowsWritten: result.metrics.rowsWritten,
				durationMs: result.metrics.durationMs,
				nodeResults: result.metrics.nodeResults,
			});
			this.execution.finish();
			return result;
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "Erreur ETL";
			this._lastError.set(message);
			this.executionLoggerService.error(message);
			this.executionLoggerService.finish({ error: message });
			this.execution.fail(message);
			const node = this.selectedNode();
			void this.copilot.diagnoseExecutionError(message, {
				nodeLabel: node?.label,
				nodeType: node?.type,
				nodeConfig: node?.config,
				pipelineSummary: `${this._canvasPipeline().nodes.length} nœuds`,
			});
			throw error;
		} finally {
			this._running.set(false);
		}
	}

	async execute(
		projectId: string,
	): Promise<{ executionId: string; result: PipelineRunResult }> {
		await this.saveCanvasPipeline();

		try {
			const result = await this.runPipelineLocally();

			const { data, error } = await this.supabase.rpc("execute_etl_pipeline", {
				project_id_param: projectId,
				metrics_param: {
					rows_read: result.metrics.rowsRead,
					rows_written: result.metrics.rowsWritten,
					duration_ms: result.metrics.durationMs,
					node_results: result.metrics.nodeResults,
					logs: result.logs,
				} as unknown as Json,
				error_message_param: undefined,
			});

			if (error) {
				throw error;
			}

			if (!data) {
				throw new Error("Exécution lancée mais identifiant introuvable.");
			}

			return { executionId: data as string, result };
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "Erreur ETL";

			await this.supabase.rpc("execute_etl_pipeline", {
				project_id_param: projectId,
				metrics_param: null,
				error_message_param: message,
			});

			throw error;
		}
	}

	applyDiagnosisFix(actionType: string): void {
		if (actionType === "fix_srid") {
			const reproject = this._canvasPipeline().nodes.find(
				(node) => node.type === "reproject",
			);
			if (reproject) {
				this.updateNodeConfig(reproject.id, {
					...reproject.config,
					source_srid: 4326,
					target_srid: 2154,
				});
				return;
			}
			const catalogIndex = NODE_CATALOG.findIndex(
				(item) => item.type === "reproject",
			);
			if (catalogIndex >= 0) {
				this.addNode(catalogIndex);
			}
		}
	}

	async runPipelineFromChat(
		pipeline: EtlPipelineJson,
		file?: File | null,
	): Promise<PipelineRunResult> {
		await this.injectPipelineWithFile(pipeline, file);
		let project = this.activeProject();
		if (!project) {
			project = await this.create({ name: this.buildDefaultProjectName() });
		}
		const { result } = await this.execute(project.id);
		return result;
	}
}
