import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideDownload,
  LucideFileCode,
  LucidePlay,
  LucidePlus,
  LucideSave,
  LucideSparkles,
  LucideWorkflow,
} from '@lucide/angular';
import { toast } from 'ngx-sonner';
import { UxModeService } from '@app/core/ux-mode/ux-mode.service';
import { CopilotChatComponent } from '../copilot/components/copilot-chat/copilot-chat.component';
import type { CopilotMessage, EtlPipelineJson } from '../copilot/copilot.types';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmInputImports } from '@app/shared/ui/input';
import { HlmLabelImports } from '@app/shared/ui/label';
import { HlmSkeletonImports } from '@app/shared/ui/skeleton';
import { EditorCanvasComponent } from './components/editor-canvas/editor-canvas.component';
import { EditorMapPreviewComponent } from './components/editor-map-preview/editor-map-preview.component';
import { EditorNodePanelComponent } from './components/editor-node-panel/editor-node-panel.component';
import { EditorExportService, type DataExportFormat } from './services/editor-export.service';
import { EditorService } from './editor.service';

@Component({
  selector: 'app-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LucidePlay,
    LucidePlus,
    LucideSave,
    LucideWorkflow,
    LucideSparkles,
    LucideDownload,
    LucideFileCode,
    HlmButtonImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSkeletonImports,
    EditorCanvasComponent,
    EditorNodePanelComponent,
    EditorMapPreviewComponent,
    CopilotChatComponent,
  ],
  template: `
    <div class="space-y-4">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">
            @if (uxMode.mode() === 'novice') {
              <svg lucideSparkles class="size-6 text-primary"></svg>
              Espace ETL guidé
            } @else {
              <svg lucideWorkflow class="size-6 text-primary"></svg>
              Éditeur de pipeline
            }
          </h1>
          <p class="text-muted-foreground text-sm mt-1">
            @if (uxMode.mode() === 'novice') {
              Décrivez votre transformation en langage naturel — zéro code.
            } @else {
              Canvas nodal, inspecteur et console de code pour les experts SIG.
            }
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          @if (uxMode.mode() === 'expert') {
            <button hlmBtn variant="outline" type="button" (click)="createProject()">
              <svg lucidePlus class="size-4"></svg>
              Nouveau projet
            </button>
            <button
              hlmBtn
              variant="outline"
              type="button"
              [disabled]="editorService.saving() || !editorService.activeProject()"
              (click)="savePipeline()"
            >
              <svg lucideSave class="size-4"></svg>
              Enregistrer
            </button>
            <button hlmBtn variant="outline" type="button" (click)="exportPythonScript()">
              <svg lucideFileCode class="size-4"></svg>
              Script Python
            </button>
          }
          @if (editorService.activeProject(); as project) {
            <button
              hlmBtn
              type="button"
              [disabled]="editorService.saving() || editorService.running()"
              (click)="executeProject(project.id)"
            >
              <svg lucidePlay class="size-4"></svg>
              {{ editorService.running() ? 'Exécution…' : 'Exécuter' }}
            </button>
          }
        </div>
      </div>

      @if (editorService.loading()) {
        <div class="space-y-3">
          <div hlmSkeleton class="h-10 w-full"></div>
          <div hlmSkeleton class="h-64 w-full"></div>
        </div>
      } @else if (uxMode.mode() === 'novice') {
        <div class="grid h-[calc(100dvh-11rem)] min-h-[32rem] grid-cols-1 gap-4 lg:grid-cols-2">
          <app-copilot-chat
            [showHeader]="true"
            [compactActions]="true"
            (injectPipeline)="onInjectPipeline($event)"
            (runPipeline)="onRunFromChat($event)"
            (applyDiagnosis)="onApplyDiagnosis($event)"
          />

          <div class="flex min-h-0 flex-col gap-2 rounded-lg border bg-card p-2">
            <div class="flex flex-wrap items-center justify-between gap-2 px-1">
              <p class="text-sm font-medium">Carte de résultat</p>
              <div class="flex flex-wrap gap-1">
                @for (format of exportFormats; track format.id) {
                  <button
                    hlmBtn
                    variant="outline"
                    size="sm"
                    type="button"
                    class="text-xs h-7"
                    [disabled]="!editorService.workspacePreview()"
                    (click)="exportData(format.id)"
                  >
                    <svg lucideDownload class="size-3"></svg>
                    {{ format.label }}
                  </button>
                }
              </div>
            </div>

            @if (editorService.running() || editorService.executionProgress() > 0) {
              <div class="rounded-md border bg-muted/40 p-2 text-[10px] space-y-2 mx-1">
                <p class="font-medium">{{ editorService.executionStatus() }}</p>
                <div class="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    class="h-full bg-primary transition-all duration-200"
                    [style.width.%]="editorService.executionProgress()"
                  ></div>
                </div>
                <p class="tabular-nums">{{ editorService.executionProgress() }} %</p>
              </div>
            }

            <div class="flex-1 min-h-[400px] rounded-md border overflow-hidden">
              <app-editor-map-preview
                [collection]="editorService.workspacePreview()"
                [srid]="editorService.activeProject()?.default_srid ?? 4326"
              />
            </div>
          </div>
        </div>
      } @else {
        <div class="grid gap-4 lg:grid-cols-[14rem_1fr_18rem] min-h-[32rem] items-stretch">
          <aside class="space-y-3">
            <div class="space-y-1">
              <label hlmLabel for="project-select" class="text-xs">Projet</label>
              <select
                id="project-select"
                class="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
                [ngModel]="editorService.activeProjectId()"
                (ngModelChange)="editorService.setActiveProject($event)"
                name="activeProjectId"
              >
                @for (project of editorService.projects(); track project.id) {
                  <option [value]="project.id">{{ project.name }}</option>
                }
              </select>
            </div>

            <div class="space-y-1">
              <p class="text-xs font-medium text-muted-foreground">Ajouter un nœud</p>
              <div class="flex flex-col gap-1">
                @for (item of editorService.nodeCatalog; track item.label; let i = $index) {
                  <button
                    hlmBtn
                    variant="ghost"
                    size="sm"
                    type="button"
                    class="justify-start text-xs h-8"
                    (click)="editorService.addNode(i)"
                  >
                    {{ item.label }}
                  </button>
                }
              </div>
            </div>

            <div class="space-y-1">
              <p class="text-xs font-medium text-muted-foreground">Exporter les données</p>
              <div class="flex flex-col gap-1">
                @for (format of exportFormats; track format.id) {
                  <button
                    hlmBtn
                    variant="ghost"
                    size="sm"
                    type="button"
                    class="justify-start text-xs h-8"
                    [disabled]="!exportCollection()"
                    (click)="exportData(format.id)"
                  >
                    <svg lucideDownload class="size-3.5"></svg>
                    {{ format.label }}
                  </button>
                }
              </div>
            </div>

            @if (editorService.running() || editorService.executionProgress() > 0) {
              <div class="rounded-md border bg-muted/40 p-2 text-[10px] space-y-2">
                <p class="font-medium">{{ editorService.executionStatus() }}</p>
                <div class="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    class="h-full bg-primary transition-all duration-200"
                    [style.width.%]="editorService.executionProgress()"
                  ></div>
                </div>
                <p class="tabular-nums">{{ editorService.executionProgress() }} %</p>
              </div>
            }

            @if (editorService.lastRunResult(); as run) {
              <div class="rounded-md border bg-muted/40 p-2 text-[10px] space-y-1">
                <p class="font-medium">Dernière exécution</p>
                <p>{{ run.metrics.rowsWritten }} entité(s) — {{ run.metrics.durationMs }} ms</p>
              </div>
            }
          </aside>

          <div class="flex flex-col gap-3 min-h-[32rem]">
            <app-editor-canvas
              class="flex-1"
              [pipeline]="editorService.canvasPipeline()"
              [selectedNodeId]="editorService.selectedNodeId()"
              (selectNode)="editorService.selectNode($event)"
              (moveNode)="editorService.moveNode($event.nodeId, $event.position)"
              (connectNodes)="editorService.connectNodes($event.sourceId, $event.targetId)"
              (explainNode)="onExplainNode($event)"
            />

            <div class="rounded-lg border bg-card p-3 max-h-48 overflow-auto">
              <p class="text-xs font-medium mb-2">Console pipeline (JSON)</p>
              <pre class="text-[10px] font-mono whitespace-pre-wrap">{{ pipelineJson() }}</pre>
              @if (editorService.lastRunResult()?.logs?.length) {
                <p class="text-xs font-medium mt-3 mb-1">Logs d'exécution</p>
                <pre class="text-[10px] text-muted-foreground whitespace-pre-wrap">{{ executionLogs() }}</pre>
              }
            </div>
          </div>

          <aside class="rounded-lg border bg-card p-3 overflow-y-auto min-h-[32rem] max-h-[32rem]">
            <app-editor-node-panel
              [node]="editorService.selectedNode()"
              [preview]="editorService.selectedNodePreview()"
              [assistantReply]="editorService.assistantReply()"
              [srid]="editorService.activeProject()?.default_srid ?? 4326"
              (configChange)="editorService.updateNodeConfig($event.nodeId, $event.config)"
              (fileImport)="onFileImport($event.nodeId, $event.file)"
              (askAssistant)="onAskAssistant()"
            />
          </aside>
        </div>
      }
    </div>
  `,
})
export class EditorPage implements OnInit {
  readonly editorService = inject(EditorService);
  readonly uxMode = inject(UxModeService);
  private readonly exportService = inject(EditorExportService);

  readonly exportFormats: Array<{ id: DataExportFormat; label: string }> = [
    { id: 'geojson', label: 'GeoJSON' },
    { id: 'csv', label: 'CSV' },
    { id: 'shapefile', label: 'Shapefile (.zip)' },
    { id: 'geopackage', label: 'GeoPackage' },
    { id: 'parquet', label: 'Parquet' },
  ];

  ngOnInit(): void {
    void this.refresh();
  }

  exportCollection() {
    return (
      this.editorService.lastRunResult()?.output?.collection ??
      this.editorService.workspacePreview()
    );
  }

  pipelineJson(): string {
    return JSON.stringify(this.editorService.canvasPipeline(), null, 2);
  }

  executionLogs(): string {
    return (this.editorService.lastRunResult()?.logs ?? []).join('\n');
  }

  async refresh(): Promise<void> {
    try {
      await this.editorService.load();
      this.editorService.ensureDemoPipelineOnLoad();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors du chargement.';
      toast.error(message);
    }
  }

  onInjectPipeline(pipeline: EtlPipelineJson): void {
    this.editorService.injectPipeline(pipeline);
    toast.success('Pipeline appliqué.');
  }

  async onRunFromChat(pipeline: EtlPipelineJson): Promise<void> {
    try {
      const result = await this.editorService.runPipelineFromChat(pipeline);
      toast.success(`Pipeline exécuté — ${result.metrics.rowsWritten} entité(s).`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de l\'exécution.';
      toast.error(message);
    }
  }

  onApplyDiagnosis(message: CopilotMessage): void {
    const actionType = message.diagnosis?.actionType;
    if (actionType) {
      this.editorService.applyDiagnosisFix(actionType);
      toast.success('Correction suggérée appliquée au pipeline.');
    }
  }

  async createProject(): Promise<void> {
    const name = `Projet ${new Date().toLocaleDateString('fr-FR')}`;
    try {
      await this.editorService.create({ name });
      toast.success('Projet créé avec pipeline démo.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la création.';
      toast.error(message);
    }
  }

  async savePipeline(): Promise<void> {
    try {
      await this.editorService.saveCanvasPipeline();
      toast.success('Pipeline enregistré.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de l\'enregistrement.';
      toast.error(message);
    }
  }

  exportPythonScript(): void {
    const project = this.editorService.activeProject();
    this.exportService.exportPythonScript(
      this.editorService.canvasPipeline(),
      project?.name ?? 'pipeline',
    );
    toast.success('Script Python téléchargé.');
  }

  async exportData(format: DataExportFormat): Promise<void> {
    const collection = this.exportCollection();
    if (!collection) {
      toast.error('Aucune donnée à exporter. Exécutez d\'abord le pipeline.');
      return;
    }

    try {
      switch (format) {
        case 'geojson':
          this.exportService.exportGeoJson(collection);
          break;
        case 'csv':
          this.exportService.exportCsv(collection);
          break;
        case 'shapefile':
          await this.exportService.exportShapefileZip(collection);
          break;
        case 'geopackage':
          await this.exportService.exportGeoPackage(collection);
          break;
        case 'parquet':
          await this.exportService.exportParquet(collection);
          break;
      }
      toast.success(`Export ${format} téléchargé.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur export.';
      toast.error(message);
    }
  }

  async executeProject(projectId: string): Promise<void> {
    try {
      const { executionId, result } = await this.editorService.execute(projectId);
      toast.success(
        `Pipeline exécuté — ${result.metrics.rowsWritten} entité(s) en ${result.metrics.durationMs} ms (${executionId.slice(0, 8)}…).`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de l\'exécution.';
      toast.error(message);
    }
  }

  async onAskAssistant(): Promise<void> {
    await this.explainSelectedNode();
  }

  async onExplainNode(nodeId: string): Promise<void> {
    this.editorService.selectNode(nodeId);
    await this.explainSelectedNode();
  }

  private async explainSelectedNode(): Promise<void> {
    try {
      await this.editorService.askAssistant();
      toast.success('Explication du nœud disponible dans le panneau latéral.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur assistant.';
      toast.error(message);
    }
  }

  async onFileImport(nodeId: string, file: File): Promise<void> {
    try {
      await this.editorService.importFileToNode(nodeId, file);
      toast.success(`Fichier « ${file.name} » importé.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de l\'import.';
      toast.error(message);
    }
  }
}
