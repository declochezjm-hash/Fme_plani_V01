import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { toast } from 'ngx-sonner';
import { UxModeService } from '@app/core/ux-mode/ux-mode.service';
import { HlmSkeletonImports } from '@app/shared/ui/skeleton';
import { CopilotChatComponent } from '../copilot/components/copilot-chat/copilot-chat.component';
import type { CopilotMessage, EtlPipelineJson } from '../copilot/copilot.types';
import { EditorCanvasComponent } from './components/editor-canvas/editor-canvas.component';
import { EditorNodePanelComponent } from './components/editor-node-panel/editor-node-panel.component';
import { EditorBottomDockComponent } from './components/editor-workspace/editor-bottom-dock.component';
import { EditorNavigatorPanelComponent } from './components/editor-workspace/editor-navigator-panel.component';
import { EditorRibbonBarComponent } from './components/editor-workspace/editor-ribbon-bar.component';
import { EditorTransformerGalleryComponent } from './components/editor-workspace/editor-transformer-gallery.component';
import { EditorThemeService } from './services/editor-theme.service';
import { EditorService } from './editor.service';

type ResizeAxis = 'left' | 'right' | 'bottom' | 'leftSplit';

interface ResizeSession {
  axis: ResizeAxis;
  start: number;
  initial: number;
}

@Component({
  selector: 'app-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmSkeletonImports,
    EditorRibbonBarComponent,
    EditorNavigatorPanelComponent,
    EditorTransformerGalleryComponent,
    EditorCanvasComponent,
    EditorNodePanelComponent,
    EditorBottomDockComponent,
    CopilotChatComponent,
  ],
  host: {
    class: 'block h-full min-h-0',
  },
  template: `
    <div class="-m-6 flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden bg-background">
      <app-editor-ribbon-bar
        [dark]="editorTheme.dark()"
        [uxMode]="uxMode.mode()"
        [saving]="editorService.saving()"
        [running]="editorService.running()"
        [hasProject]="!!editorService.activeProject()"
        (newProject)="createProject()"
        (openProject)="openPipelineFile()"
        (saveProject)="savePipeline()"
        (runProject)="runActiveProject()"
        (stopProject)="editorService.stopExecution()"
        (zoomIn)="canvas()?.zoomIn()"
        (zoomOut)="canvas()?.zoomOut()"
        (fitView)="canvas()?.fitView()"
        (addReader)="editorService.addNodeByCategory('reader')"
        (addWriter)="editorService.addNodeByCategory('writer')"
        (addTransformer)="editorService.addNodeByCategory('transformer')"
        (addGroup)="addGroupFromRibbon()"
        (toggleTheme)="editorTheme.toggle()"
        (setUxMode)="uxMode.setMode($event)"
      />

      @if (editorService.loading()) {
        <div class="flex flex-1 flex-col gap-2 p-3">
          <div hlmSkeleton class="h-8 w-full"></div>
          <div hlmSkeleton class="flex-1 w-full"></div>
        </div>
      } @else {
        <div class="flex min-h-0 flex-1">
          @if (leftPanelOpen()) {
            <aside
              class="flex shrink-0 flex-col border-r bg-card"
              [style.width.px]="leftWidth()"
            >
              <div class="min-h-0 overflow-hidden" [style.height.%]="leftSplitRatio() * 100">
                <app-editor-navigator-panel
                  class="block h-full"
                  [pipeline]="editorService.canvasPipeline()"
                  [selectedNodeId]="editorService.selectedNodeId()"
                  (selectNode)="editorService.selectNode($event)"
                  (selectGroup)="onSelectGroup($event)"
                />
              </div>
              <div
                class="h-1 shrink-0 cursor-row-resize bg-border/70 hover:bg-primary/40"
                (pointerdown)="startResize($event, 'leftSplit')"
              ></div>
              <div class="min-h-0 flex-1 overflow-hidden">
                <app-editor-transformer-gallery
                  class="block h-full"
                  (addCatalogItem)="editorService.addNode($event)"
                />
              </div>
            </aside>
            <div
              class="w-1 shrink-0 cursor-col-resize bg-border/70 hover:bg-primary/40"
              (pointerdown)="startResize($event, 'left')"
            ></div>
          }

          <div class="flex min-w-0 flex-1 flex-col">
            <div class="flex h-8 shrink-0 items-end gap-0.5 border-b bg-muted/20 px-2">
              @for (tab of workspaceTabs; track tab.id) {
                <button
                  type="button"
                  class="rounded-t px-3 py-1 text-[11px] font-medium"
                  [class]="activeWorkspaceTab() === tab.id ? 'bg-card border border-b-0' : 'text-muted-foreground hover:text-foreground'"
                  (click)="activeWorkspaceTab.set(tab.id)"
                >
                  {{ tab.label }}
                </button>
              }
            </div>

            <div class="relative min-h-0 flex-1">
              @if (uxMode.mode() === 'novice') {
                <app-copilot-chat
                  class="absolute inset-y-0 left-0 z-10 w-full border-r bg-card lg:w-[42%]"
                  [showHeader]="false"
                  [compactActions]="true"
                  (injectPipeline)="onInjectPipeline($event)"
                  (runPipeline)="onRunFromChat($event)"
                  (applyDiagnosis)="onApplyDiagnosis($event)"
                />
              }
              <app-editor-canvas
                #canvasRef
                [class]="
                  uxMode.mode() === 'novice'
                    ? 'absolute inset-y-0 left-[42%] h-full w-[58%]'
                    : 'absolute inset-0 h-full'
                "
                [pipeline]="editorService.canvasPipeline()"
                [selectedNodeId]="editorService.selectedNodeId()"
                [selectedEdgeId]="editorService.selectedEdgeId()"
                [dark]="editorTheme.dark()"
                (explainNode)="onExplainNode($event)"
                (openInspector)="onOpenInspector($event)"
                (workspaceFileDropped)="onWorkspaceFileDropped($event)"
              />
            </div>

            @if (bottomPanelOpen()) {
              <div
                class="h-1 shrink-0 cursor-row-resize bg-border/70 hover:bg-primary/40"
                (pointerdown)="startResize($event, 'bottom')"
              ></div>
              <div
                class="shrink-0 overflow-hidden"
                [style.height.px]="bottomCollapsed() ? 32 : bottomHeight()"
              >
                <app-editor-bottom-dock
                  class="block h-full"
                  [preview]="editorService.workspacePreview()"
                  [attributes]="editorService.selectedNodeAttributes()"
                  [srid]="editorService.activeProject()?.default_srid ?? 4326"
                  [executionStatus]="editorService.executionStatus()"
                  [executionProgress]="editorService.executionProgress()"
                  [collapsed]="bottomCollapsed()"
                  (toggleCollapsed)="bottomCollapsed.set(!bottomCollapsed())"
                />
              </div>
            }
          </div>

          @if (rightPanelOpen()) {
            <div
              class="w-1 shrink-0 cursor-col-resize bg-border/70 hover:bg-primary/40"
              (pointerdown)="startResize($event, 'right')"
            ></div>
            <aside
              class="flex shrink-0 flex-col overflow-hidden border-l bg-card"
              [style.width.px]="rightWidth()"
            >
              <p class="border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Inspecteur de nœud
              </p>
              <div class="min-h-0 flex-1 overflow-y-auto p-2">
                <app-editor-node-panel
                  [node]="editorService.selectedNode()"
                  [preview]="editorService.selectedNodePreview()"
                  [attributes]="editorService.selectedNodeAttributes()"
                  [assistantReply]="editorService.assistantReply()"
                  [focusParamsToken]="inspectorFocusToken()"
                  [srid]="editorService.activeProject()?.default_srid ?? 4326"
                  (configChange)="editorService.updateNodeConfig($event.nodeId, $event.config)"
                  (fileImport)="onFileImport($event.nodeId, $event.file)"
                  (askAssistant)="onAskAssistant()"
                />
              </div>
            </aside>
          }
        </div>
      }

      <input
        #pipelineFileInput
        type="file"
        accept=".fmw,.json,.model3,application/json"
        class="hidden"
        (change)="onPipelineFileSelected($event)"
      />
    </div>
  `,
})
export class EditorPage implements OnInit {
  readonly editorService = inject(EditorService);
  readonly uxMode = inject(UxModeService);
  readonly editorTheme = inject(EditorThemeService);
  readonly canvas = viewChild<EditorCanvasComponent>('canvasRef');
  readonly pipelineFileInput = viewChild<ElementRef<HTMLInputElement>>('pipelineFileInput');

  readonly inspectorFocusToken = signal(0);
  readonly leftPanelOpen = signal(true);
  readonly rightPanelOpen = signal(true);
  readonly bottomPanelOpen = signal(true);
  readonly bottomCollapsed = signal(false);

  readonly leftWidth = signal(248);
  readonly rightWidth = signal(320);
  readonly bottomHeight = signal(220);
  readonly leftSplitRatio = signal(0.52);

  readonly activeWorkspaceTab = signal('main');
  readonly workspaceTabs = [{ id: 'main', label: 'Main Workspace' }];

  private resizeSession: ResizeSession | null = null;

  ngOnInit(): void {
    void this.refresh();
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

  startResize(event: PointerEvent, axis: ResizeAxis): void {
    event.preventDefault();
    const start = axis === 'left' || axis === 'right' ? event.clientX : event.clientY;
    const initial =
      axis === 'left'
        ? this.leftWidth()
        : axis === 'right'
          ? this.rightWidth()
          : axis === 'bottom'
            ? this.bottomHeight()
            : this.leftSplitRatio();

    this.resizeSession = { axis, start, initial };

    const onMove = (moveEvent: PointerEvent) => {
      const session = this.resizeSession;
      if (!session) {
        return;
      }

      if (session.axis === 'left') {
        const delta = moveEvent.clientX - session.start;
        this.leftWidth.set(Math.min(420, Math.max(180, session.initial + delta)));
        return;
      }

      if (session.axis === 'right') {
        const delta = session.start - moveEvent.clientX;
        this.rightWidth.set(Math.min(520, Math.max(240, session.initial + delta)));
        return;
      }

      if (session.axis === 'bottom') {
        const delta = session.start - moveEvent.clientY;
        this.bottomHeight.set(Math.min(480, Math.max(120, session.initial + delta)));
        this.bottomCollapsed.set(false);
        return;
      }

      const container = (event.target as HTMLElement).closest('aside');
      const total = container?.clientHeight ?? 600;
      const delta = moveEvent.clientY - session.start;
      const next = session.initial + delta / total;
      this.leftSplitRatio.set(Math.min(0.78, Math.max(0.22, next)));
    };

    const onUp = () => {
      this.resizeSession = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  addGroupFromRibbon(): void {
    const pan = this.canvas()?.pan() ?? { x: 0, y: 0 };
    this.editorService.addGroup('Bookmark', { panX: pan.x, panY: pan.y });
  }

  onSelectGroup(_groupId: string): void {
    // Group selection is handled on canvas; navigator acts as quick access.
  }

  openPipelineFile(): void {
    this.pipelineFileInput()?.nativeElement.click();
  }

  async onPipelineFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      await this.onWorkspaceFileDropped(file);
    } finally {
      input.value = '';
    }
  }

  async onWorkspaceFileDropped(file: File): Promise<void> {
    try {
      const warnings = await this.editorService.importProjectFile(file);
      this.bottomCollapsed.set(false);
      this.canvas()?.fitView();
      toast.success(`Projet « ${file.name} » importé.`);
      if (warnings.length > 0) {
        toast.message(`Import terminé avec ${warnings.length} avertissement(s). Consultez la console.`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de l\'import.';
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

  async runActiveProject(): Promise<void> {
    const project = this.editorService.activeProject();
    if (!project) {
      toast.error('Aucun projet actif.');
      return;
    }
    await this.executeProject(project.id);
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

  onOpenInspector(_nodeId: string): void {
    this.inspectorFocusToken.update((value) => value + 1);
  }

  private async explainSelectedNode(): Promise<void> {
    try {
      await this.editorService.askAssistant();
      toast.success('Explication du nœud disponible dans l\'inspecteur.');
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
