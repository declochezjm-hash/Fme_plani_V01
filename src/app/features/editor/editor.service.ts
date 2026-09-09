import { computed, inject, Injectable, signal } from '@angular/core';
import { AuthService } from '@app/core/auth/auth.service';
import type { Json } from '@app/core/supabase/database.types';
import { SupabaseService } from '@app/core/supabase/supabase.service';
import type { EtlPipelineJson, EtlPipelineNode } from '../copilot/copilot.types';
import { CopilotService } from '../copilot/copilot.service';
import { DEFAULT_DEMO_PIPELINE, NODE_CATALOG, type PipelineRunResult } from './services/etl.types';
import { PipelineExecutionService } from './services/pipeline-execution.service';
import { PipelineRunnerService } from './services/pipeline-runner.service';
import type { CreateProjectDto, EtlProject, UpdateProjectDto } from './editor.types';

const EMPTY_PIPELINE: EtlPipelineJson = {
  version: 1,
  nodes: [],
  edges: [],
};

@Injectable({ providedIn: 'root' })
export class EditorService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  private readonly runner = inject(PipelineRunnerService);
  private readonly execution = inject(PipelineExecutionService);
  private readonly copilot = inject(CopilotService);

  private readonly _projects = signal<EtlProject[]>([]);
  private readonly _activeProjectId = signal<string | null>(null);
  private readonly _canvasPipeline = signal<EtlPipelineJson>(EMPTY_PIPELINE);
  private readonly _selectedNodeId = signal<string | null>(null);
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
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly running = this._running.asReadonly();
  readonly lastRunResult = this._lastRunResult.asReadonly();
  readonly assistantReply = this._assistantReply.asReadonly();
  readonly lastError = this._lastError.asReadonly();
  readonly executionProgress = this.execution.progress;
  readonly executionStatus = this.execution.status;
  readonly nodeCatalog = NODE_CATALOG;

  readonly activeProject = computed(() => {
    const id = this._activeProjectId();
    if (!id) {
      return null;
    }
    return this._projects().find((project) => project.id === id) ?? null;
  });

  readonly pipeline = computed<EtlPipelineJson>(() => this._canvasPipeline());

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

    const reader = this._canvasPipeline().nodes.find((node) => node.type === 'reader');
    const inline = reader?.config['inline'];
    if (inline && typeof inline === 'object' && (inline as { type?: string }).type === 'FeatureCollection') {
      return inline as import('geojson').FeatureCollection;
    }

    return null;
  });

  readonly selectedNodePreview = computed(() => {
    const nodeId = this._selectedNodeId();
    const result = this._lastRunResult();
    if (nodeId && result?.intermediates[nodeId]) {
      return result.intermediates[nodeId].collection;
    }

    const node = this.selectedNode();
    if (node?.type === 'reader' && node.config['inline']) {
      const inline = node.config['inline'] as { type?: string; features?: unknown[] };
      if (inline.type === 'FeatureCollection') {
        return inline as import('geojson').FeatureCollection;
      }
    }

    return result?.output?.collection ?? null;
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

  private normalizePipeline(config: EtlPipelineJson | undefined | null): EtlPipelineJson {
    if (!config?.nodes?.length) {
      return this.cloneDemoPipeline();
    }
    return config;
  }

  private cloneDemoPipeline(): EtlPipelineJson {
    return JSON.parse(JSON.stringify(DEFAULT_DEMO_PIPELINE)) as EtlPipelineJson;
  }

  selectNode(nodeId: string | null): void {
    this._selectedNodeId.set(nodeId);
  }

  injectPipeline(pipeline: EtlPipelineJson): void {
    const remapped = this.remapPipelineIds(pipeline);
    this._canvasPipeline.set(remapped);
    this._selectedNodeId.set(remapped.nodes[0]?.id ?? null);
    this._lastRunResult.set(null);
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
    const nodes: EtlPipelineNode[] = pipeline.nodes.map((node, index) => {
      const newId = `${node.type}-${crypto.randomUUID().slice(0, 8)}`;
      idMap.set(node.id, newId);
      return {
        ...node,
        id: newId,
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
    }));

    return { version: pipeline.version ?? 1, nodes, edges };
  }

  async load(): Promise<void> {
    this._loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) {
        throw error;
      }

      const mapped: EtlProject[] = (data ?? []).map((row) => ({
        id: row.id ?? '',
        organization_id: row.organization_id ?? '',
        name: row.name ?? '',
        description: row.description,
        default_srid: row.default_srid ?? 4326,
        pipeline_config: (row.pipeline_config as unknown as EtlPipelineJson) ?? EMPTY_PIPELINE,
        status: (row.status as EtlProject['status']) ?? 'draft',
        created_by: row.created_by,
        created_at: row.created_at ?? '',
        updated_at: row.updated_at ?? '',
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

  async create(dto: CreateProjectDto): Promise<EtlProject> {
    this._saving.set(true);
    try {
      const organizationId = this.auth.userProfile()?.organization_id;
      if (!organizationId) {
        throw new Error('Organisation introuvable.');
      }

      const { data, error } = await this.supabase
        .from('projects')
        .insert({
          name: dto.name,
          description: dto.description ?? null,
          default_srid: dto.default_srid ?? 4326,
          pipeline_config: (dto.pipeline_config ?? DEFAULT_DEMO_PIPELINE) as unknown as Json,
          organization_id: organizationId,
          created_by: this.auth.user()?.id ?? null,
          status: 'draft',
        })
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      await this.load();

      const created = this._projects().find((project) => project.id === data.id);
      if (created) {
        this.setActiveProject(created.id);
        return created;
      }

      throw new Error('Projet créé mais introuvable.');
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
      const { error } = await this.supabase.from('projects').update(payload).eq('id', projectId);

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
      throw new Error('Aucun projet actif.');
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

  addNode(catalogIndex: number): void {
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
      position: { x: 80 + this._canvasPipeline().nodes.length * 40, y: 80 },
    };

    this._canvasPipeline.update((pipeline) => ({
      ...pipeline,
      nodes: [...pipeline.nodes, node],
    }));
    this._selectedNodeId.set(id);
  }

  connectNodes(sourceId: string, targetId: string): void {
    const exists = this._canvasPipeline().edges.some(
      (edge) => edge.source === sourceId && edge.target === targetId,
    );
    if (exists) {
      return;
    }

    this._canvasPipeline.update((pipeline) => ({
      ...pipeline,
      edges: [
        ...pipeline.edges,
        { id: `edge-${crypto.randomUUID().slice(0, 8)}`, source: sourceId, target: targetId },
      ],
    }));
  }

  updateNodeConfig(nodeId: string, config: Record<string, unknown>): void {
    this._canvasPipeline.update((pipeline) => ({
      ...pipeline,
      nodes: pipeline.nodes.map((node) =>
        node.id === nodeId ? { ...node, config } : node,
      ),
    }));
  }

  async importFileToNode(nodeId: string, file: File): Promise<void> {
    const node = this._canvasPipeline().nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (extension === 'geojson' || extension === 'json') {
      const text = await file.text();
      const inline = JSON.parse(text);
      this.updateNodeConfig(nodeId, { ...node.config, format: 'geojson', inline });
      return;
    }

    if (extension === 'csv') {
      const text = await file.text();
      this.updateNodeConfig(nodeId, { ...node.config, format: 'csv', text });
      return;
    }

    if (extension === 'zip' || extension === 'shp') {
      const base64 = await this.fileToBase64(file);
      this.updateNodeConfig(nodeId, { ...node.config, format: 'shapefile', fileBase64: base64 });
      return;
    }

    if (extension === 'gpkg') {
      const base64 = await this.fileToBase64(file);
      this.updateNodeConfig(nodeId, { ...node.config, format: 'geopackage', fileBase64: base64 });
      return;
    }

    if (extension === 'ifc') {
      const base64 = await this.fileToBase64(file);
      this.updateNodeConfig(nodeId, { ...node.config, format: 'ifc', fileBase64: base64 });
      return;
    }

    throw new Error(`Extension .${extension} non supportée.`);
  }

  private async fileToBase64(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  async runPipelineLocally(): Promise<PipelineRunResult> {
    const project = this.activeProject();
    if (!project) {
      throw new Error('Aucun projet actif.');
    }

    this._running.set(true);
    this._lastError.set(null);
    this.execution.begin();
    try {
      const result = await this.runner.run(this._canvasPipeline(), project.default_srid);
      this._lastRunResult.set(result);
      this.execution.finish();
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur ETL';
      this._lastError.set(message);
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

  async execute(projectId: string): Promise<{ executionId: string; result: PipelineRunResult }> {
    await this.saveCanvasPipeline();

    try {
      const result = await this.runPipelineLocally();

      const { data, error } = await this.supabase.rpc('execute_etl_pipeline', {
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
        throw new Error('Exécution lancée mais identifiant introuvable.');
      }

      return { executionId: data as string, result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur ETL';

      await this.supabase.rpc('execute_etl_pipeline', {
        project_id_param: projectId,
        metrics_param: null,
        error_message_param: message,
      });

      throw error;
    }
  }

  applyDiagnosisFix(actionType: string): void {
    if (actionType === 'fix_srid') {
      const reproject = this._canvasPipeline().nodes.find((node) => node.type === 'reproject');
      if (reproject) {
        this.updateNodeConfig(reproject.id, {
          ...reproject.config,
          source_srid: 4326,
          target_srid: 2154,
        });
        return;
      }
      const catalogIndex = NODE_CATALOG.findIndex((item) => item.type === 'reproject');
      if (catalogIndex >= 0) {
        this.addNode(catalogIndex);
      }
    }
  }

  async runPipelineFromChat(pipeline: EtlPipelineJson): Promise<PipelineRunResult> {
    this.injectPipeline(pipeline);
    let project = this.activeProject();
    if (!project) {
      project = await this.create({ name: `Projet ${new Date().toLocaleDateString('fr-FR')}` });
    }
    const { result } = await this.execute(project.id);
    return result;
  }
}
