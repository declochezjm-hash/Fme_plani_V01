import { computed, Injectable, inject, signal } from "@angular/core";
import { CopilotWorkflowService } from "@app/core/services/copilot/copilot-workflow.service";
import type { FileInspectionResult } from "@app/core/services/copilot/file-inspection.types";
import { PipelineFileService } from "@app/core/services/copilot/pipeline-file.service";
import { SupabaseService } from "@app/core/supabase/supabase.service";
import type {
	CopilotDiagnosis,
	CopilotExplainContext,
	CopilotMessage,
	CopilotMode,
	CopilotPromptResult,
	EtlPipelineJson,
} from "./copilot.types";
import { CopilotLlmService } from "./copilot-llm.service";

const EMPTY_PIPELINE: EtlPipelineJson = {
	version: 1,
	nodes: [],
	edges: [],
};

@Injectable({ providedIn: "root" })
export class CopilotService {
	private readonly supabase = inject(SupabaseService).client;
	private readonly llm = inject(CopilotLlmService);
	private readonly workflow = inject(CopilotWorkflowService);
	private readonly pipelineFile = inject(PipelineFileService);

	private readonly _messages = signal<CopilotMessage[]>([]);
	private readonly _pendingFile = signal<File | null>(null);
	private readonly _pendingInspection = signal<FileInspectionResult | null>(
		null,
	);
	private readonly _loading = signal(false);
	private readonly _mode = signal<CopilotMode>("novice");
	private readonly _lastPipeline = signal<EtlPipelineJson>(EMPTY_PIPELINE);

	readonly messages = this._messages.asReadonly();
	readonly loading = this._loading.asReadonly();
	readonly mode = this._mode.asReadonly();
	readonly lastPipeline = this._lastPipeline.asReadonly();

	readonly hasMessages = computed(() => this._messages().length > 0);
	readonly messageCount = computed(() => this._messages().length);

	setMode(mode: CopilotMode): void {
		this._mode.set(mode);
	}

	clearConversation(): void {
		this._messages.set([]);
		this._lastPipeline.set(EMPTY_PIPELINE);
		this._pendingFile.set(null);
		this._pendingInspection.set(null);
	}

	readonly pendingFile = this._pendingFile.asReadonly();
	readonly pendingInspection = this._pendingInspection.asReadonly();

	presentFileInspection(inspection: FileInspectionResult, file: File): void {
		this._pendingFile.set(file);
		this._pendingInspection.set(inspection);

		const assistantMessage: CopilotMessage = {
			id: crypto.randomUUID(),
			role: "assistant",
			content: `J'ai analysé **${inspection.fileName}**. Que souhaitez-vous faire avec ces données ?`,
			timestamp: new Date().toISOString(),
			fileInspection: inspection,
			actionChips: this.workflow.buildActionChips(inspection),
		};

		this._messages.update((messages) => [...messages, assistantMessage]);
	}

	buildPipelineForAction(actionId: string): EtlPipelineJson | null {
		const inspection = this._pendingInspection();
		if (!inspection) {
			return null;
		}
		const pipeline = this.workflow.buildPipeline(inspection, actionId);
		this._lastPipeline.set(pipeline);
		return pipeline;
	}

	confirmWorkflowGenerated(fileName: string): void {
		const assistantMessage: CopilotMessage = {
			id: crypto.randomUUID(),
			role: "assistant",
			content: `Projet généré avec succès pour « ${fileName} » ! Cliquez sur Exécuter pour lancer le traitement.`,
			timestamp: new Date().toISOString(),
			pipeline: this._lastPipeline(),
		};
		this._messages.update((messages) => [...messages, assistantMessage]);
	}

	async applyActionChip(
		actionId: string,
		chipLabel: string,
	): Promise<EtlPipelineJson | null> {
		const inspection = this._pendingInspection();
		const pendingFile = this._pendingFile();
		if (!inspection) {
			return null;
		}

		const userMessage: CopilotMessage = {
			id: crypto.randomUUID(),
			role: "user",
			content: chipLabel,
			timestamp: new Date().toISOString(),
		};
		this._messages.update((messages) => [...messages, userMessage]);

		let pipeline = this.workflow.buildPipeline(inspection, actionId);
		if (pendingFile) {
			pipeline = await this.pipelineFile.enrichPipelineWithFile(
				pipeline,
				pendingFile,
			);
		}
		this._lastPipeline.set(pipeline);

		const assistantMessage: CopilotMessage = {
			id: crypto.randomUUID(),
			role: "assistant",
			content: this.workflowSummary(inspection, chipLabel),
			timestamp: new Date().toISOString(),
			pipeline,
			plainFrenchSummary: this.workflowSummary(inspection, chipLabel),
		};
		this._messages.update((messages) => [...messages, assistantMessage]);

		return pipeline;
	}

	private workflowSummary(
		inspection: FileInspectionResult,
		actionLabel: string,
	): string {
		return `Pipeline prêt pour « ${inspection.fileName} » : ${actionLabel}. Cliquez sur Appliquer puis Exécuter.`;
	}

	async sendPrompt(prompt: string): Promise<void> {
		const trimmed = prompt.trim();
		if (!trimmed) {
			return;
		}

		const userMessage: CopilotMessage = {
			id: crypto.randomUUID(),
			role: "user",
			content: trimmed,
			timestamp: new Date().toISOString(),
		};

		this._messages.update((messages) => [...messages, userMessage]);
		this._loading.set(true);

		try {
			const result = await this.processPrompt(trimmed, this._mode());

			const assistantMessage: CopilotMessage = {
				id: crypto.randomUUID(),
				role: "assistant",
				content: result.reply,
				timestamp: new Date().toISOString(),
				pipeline: result.pipeline,
				plainFrenchSummary: result.plainFrenchSummary,
			};

			if (result.pipeline) {
				this._lastPipeline.set(result.pipeline);
			}

			this._messages.update((messages) => [...messages, assistantMessage]);
		} finally {
			this._loading.set(false);
		}
	}

	async explain(context: CopilotExplainContext): Promise<string> {
		const fallback = this.buildLocalExplanation(context);
		const prompt = [
			context.errorMessage ? `Erreur : ${context.errorMessage}` : "",
			context.nodeLabel
				? `Nœud : ${context.nodeLabel} (${context.nodeType})`
				: "",
			context.nodeConfig
				? `Config : ${JSON.stringify(context.nodeConfig)}`
				: "",
			context.pipelineSummary ?? "",
		]
			.filter(Boolean)
			.join("\n");

		const llmReply = await this.llm.explain(prompt);
		return llmReply ?? fallback;
	}

	parsePipelineFromText(text: string): EtlPipelineJson | null {
		return this.llm.extractPipelineJson(text) ?? null;
	}

	async diagnoseExecutionError(
		errorMessage: string,
		context?: CopilotExplainContext,
	): Promise<CopilotDiagnosis> {
		const llmReply = await this.llm.explain(
			[
				`Erreur d'exécution : ${errorMessage}`,
				context?.nodeLabel
					? `Nœud : ${context.nodeLabel} (${context.nodeType})`
					: "",
				context?.nodeConfig
					? `Configuration : ${JSON.stringify(context.nodeConfig)}`
					: "",
				context?.pipelineSummary ?? "",
				"Réponds en français simple pour un débutant SIG. Donne une suggestion corrective concrète.",
			]
				.filter(Boolean)
				.join("\n"),
		);

		const fallback = this.buildErrorDiagnosis(errorMessage, context);
		const suggestion = llmReply ?? fallback.suggestion;

		const diagnosis: CopilotDiagnosis = {
			summary: `L'exécution a échoué : ${errorMessage}`,
			suggestion,
			actionLabel: fallback.actionLabel,
			actionType: fallback.actionType,
		};

		const assistantMessage: CopilotMessage = {
			id: crypto.randomUUID(),
			role: "assistant",
			content: `${diagnosis.summary}\n\n${diagnosis.suggestion}`,
			timestamp: new Date().toISOString(),
			diagnosis,
		};

		this._messages.update((messages) => [...messages, assistantMessage]);
		return diagnosis;
	}

	private buildErrorDiagnosis(
		errorMessage: string,
		context?: CopilotExplainContext,
	): CopilotDiagnosis {
		const lower = errorMessage.toLowerCase();

		if (
			lower.includes("srid") ||
			lower.includes("projection") ||
			lower.includes("epsg")
		) {
			return {
				summary: `Erreur de projection : ${errorMessage}`,
				suggestion:
					"Le fichier ne possède probablement pas le bon système de coordonnées. Vérifiez le nœud de reprojection et alignez source_srid / target_srid.",
				actionLabel: "Corriger la projection (EPSG:4326 → 2154)",
				actionType: "fix_srid",
			};
		}

		if (lower.includes("entrée manquante") || lower.includes("connexion")) {
			return {
				summary: `Connexion manquante : ${errorMessage}`,
				suggestion:
					"Un nœud n'est pas relié correctement. Reliez la sortie du lecteur vers la première transformation.",
				actionLabel: "Vérifier les connexions",
				actionType: "reconnect_nodes",
			};
		}

		if (lower.includes("shapefile") || lower.includes(".zip")) {
			return {
				summary: `Shapefile : ${errorMessage}`,
				suggestion:
					"Compressez les fichiers .shp, .dbf et .shx dans une archive .zip, puis déposez le .zip sur le canvas ou importez-le via le nœud lecteur.",
				actionLabel: "Vérifier l'archive .zip",
				actionType: "check_format",
			};
		}

		if (lower.includes("format") || lower.includes("fichier")) {
			return {
				summary: `Problème de fichier : ${errorMessage}`,
				suggestion:
					"Le format du fichier importé n'est pas reconnu ou est corrompu. Réimportez un GeoJSON, CSV, GPKG ou IFC valide.",
				actionLabel: "Vérifier le format source",
				actionType: "check_format",
			};
		}

		return {
			summary: `Erreur : ${errorMessage}`,
			suggestion: context?.nodeLabel
				? `Vérifiez le nœud « ${context.nodeLabel} » et ses paramètres dans le panneau de configuration.`
				: "Vérifiez les connexions entre les nœuds et les paramètres de chaque étape.",
		};
	}

	async executePipeline(projectId: string): Promise<string> {
		const { data, error } = await this.supabase.rpc("execute_etl_pipeline", {
			project_id_param: projectId,
		});

		if (error) {
			throw error;
		}

		if (!data) {
			throw new Error("Exécution lancée mais identifiant introuvable.");
		}

		return data as string;
	}

	private async processPrompt(
		prompt: string,
		mode: CopilotMode,
	): Promise<CopilotPromptResult> {
		const llmPipeline = await this.llm.generatePipeline(prompt);
		const pipeline = llmPipeline ?? this.parsePromptToPipeline(prompt);
		const plainFrenchSummary = this.toPlainFrench(pipeline, prompt);
		const llmUsed = !!llmPipeline;

		if (mode === "novice") {
			const prefix = llmUsed ? "[Cursor Composer 2.5] " : "";
			return {
				reply: `${prefix}${plainFrenchSummary}`,
				plainFrenchSummary,
				pipeline,
				llmUsed,
			};
		}

		const prefix = llmUsed
			? "Pipeline généré via Cursor Composer 2.5"
			: "Pipeline généré localement";
		return {
			reply: `${prefix} (${pipeline.nodes.length} nœud${pipeline.nodes.length > 1 ? "s" : ""}).\n\n\`\`\`json_pipeline\n${JSON.stringify(pipeline, null, 2)}\n\`\`\``,
			plainFrenchSummary,
			pipeline,
			llmUsed,
		};
	}

	parsePromptToPipeline(prompt: string): EtlPipelineJson {
		const lower = prompt.toLowerCase();
		const nodes: EtlPipelineJson["nodes"] = [];
		const edges: EtlPipelineJson["edges"] = [];

		const sourceId = "source-1";
		nodes.push({
			id: sourceId,
			type: "reader",
			label: "Lecture des données",
			config: {
				format: lower.includes("ifc")
					? "ifc"
					: lower.includes("gpkg")
						? "geopackage"
						: "geojson",
			},
			position: { x: 80, y: 120 },
		});

		let previousId = sourceId;
		let x = 280;

		const bufferMatch = lower.match(/buffer\s+(\d+(?:[.,]\d+)?)\s*m/);
		if (bufferMatch) {
			const distance = bufferMatch[1].replace(",", ".");
			const nodeId = `buffer-${nodes.length}`;
			nodes.push({
				id: nodeId,
				type: "buffer",
				label: `Tampon ${distance} m`,
				config: { distance_m: Number(distance) },
				position: { x, y: 120 },
			});
			edges.push({
				id: `edge-${edges.length}`,
				source: previousId,
				target: nodeId,
			});
			previousId = nodeId;
			x += 200;
		}

		if (
			lower.includes("reproject") ||
			lower.includes("reprojeter") ||
			lower.includes("lambert")
		) {
			const srid = lower.includes("lambert") ? 2154 : 4326;
			const nodeId = `reproject-${nodes.length}`;
			nodes.push({
				id: nodeId,
				type: "reproject",
				label: `Reprojection EPSG:${srid}`,
				config: { source_srid: 4326, target_srid: srid },
				position: { x, y: 120 },
			});
			edges.push({
				id: `edge-${edges.length}`,
				source: previousId,
				target: nodeId,
			});
			previousId = nodeId;
			x += 200;
		}

		if (lower.includes("topolog") || lower.includes("nettoy")) {
			const nodeId = `topology-${nodes.length}`;
			nodes.push({
				id: nodeId,
				type: "topology_validator",
				label: "Nettoyage topologie",
				config: { heal: true },
				position: { x, y: 120 },
			});
			edges.push({
				id: `edge-${edges.length}`,
				source: previousId,
				target: nodeId,
			});
			previousId = nodeId;
			x += 200;
		}

		const writerId = "writer-1";
		nodes.push({
			id: writerId,
			type: "writer",
			label: "Écriture des résultats",
			config: { format: "geojson" },
			position: { x, y: 120 },
		});
		edges.push({
			id: `edge-${edges.length}`,
			source: previousId,
			target: writerId,
		});

		return { version: 1, nodes, edges };
	}

	private buildLocalExplanation(context: CopilotExplainContext): string {
		if (context.errorMessage) {
			return `L'erreur « ${context.errorMessage} » indique un problème sur le nœud « ${context.nodeLabel ?? "inconnu"} ». Vérifiez les connexions entrantes, le format source et les paramètres SRID.`;
		}

		if (context.nodeType === "buffer") {
			return `Le nœud tampon agrandit les géométries selon la distance en mètres. Augmentez « distance_m » pour un effet plus large ou connectez un reader en amont.`;
		}

		if (context.nodeType === "reproject") {
			return `La reprojection convertit les coordonnées entre deux EPSG. Vérifiez que « source_srid » correspond aux données d'entrée et « target_srid » à la sortie souhaitée (ex. 2154 pour Lambert-93).`;
		}

		return `Le nœud « ${context.nodeLabel ?? context.nodeType} » transforme le flux en entrée. Utilisez le panneau de configuration pour ajuster ses paramètres.`;
	}

	private toPlainFrench(
		pipeline: EtlPipelineJson,
		originalPrompt: string,
	): string {
		const steps = pipeline.nodes
			.filter((node) => node.type !== "reader" && node.type !== "writer")
			.map((node) => {
				if (node.type === "buffer") {
					return `créer une zone tampon de ${node.config["distance_m"]} mètres autour des géométries`;
				}
				if (node.type === "reproject") {
					return `reprojeter les données vers le système EPSG:${node.config["target_srid"]}`;
				}
				if (node.type === "topology_validator") {
					return "nettoyer et réparer la topologie des géométries";
				}
				if (node.type === "clip") {
					return "découper les entités selon une emprise";
				}
				return node.label;
			});

		if (steps.length === 0) {
			return `J'ai compris votre demande « ${originalPrompt} ». Décrivez une transformation spatiale pour que je génère le pipeline.`;
		}

		const joined = steps.join(", puis ");
		return `Voici ce que je propose : lire vos données, ${joined}, puis enregistrer le résultat.`;
	}
}
