import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucidePlay, LucidePlus, LucideSave, LucideWorkflow } from '@lucide/angular';
import { toast } from 'ngx-sonner';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmInputImports } from '@app/shared/ui/input';
import { HlmLabelImports } from '@app/shared/ui/label';
import { HlmSkeletonImports } from '@app/shared/ui/skeleton';
import { EditorCanvasComponent } from './components/editor-canvas/editor-canvas.component';
import { EditorNodePanelComponent } from './components/editor-node-panel/editor-node-panel.component';
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
    HlmButtonImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSkeletonImports,
    EditorCanvasComponent,
    EditorNodePanelComponent,
  ],
  template: `
    <div class="space-y-4">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">
            <svg lucideWorkflow class="size-6 text-primary"></svg>
            Éditeur de pipeline
          </h1>
          <p class="text-muted-foreground text-sm mt-1">
            Canvas nodal interactif — glissez les nœuds et connectez-les pour exécuter localement.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
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
      } @else {
        <div class="grid gap-4 lg:grid-cols-[14rem_1fr_18rem]">
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

            @if (editorService.lastRunResult(); as run) {
              <div class="rounded-md border bg-muted/40 p-2 text-[10px] space-y-1">
                <p class="font-medium">Dernière exécution</p>
                <p>{{ run.metrics.rowsWritten }} entité(s) — {{ run.metrics.durationMs }} ms</p>
              </div>
            }
          </aside>

          <app-editor-canvas
            [pipeline]="editorService.canvasPipeline()"
            [selectedNodeId]="editorService.selectedNodeId()"
            (selectNode)="editorService.selectNode($event)"
            (moveNode)="editorService.moveNode($event.nodeId, $event.position)"
            (connectNodes)="editorService.connectNodes($event.sourceId, $event.targetId)"
          />

          <aside class="rounded-lg border bg-card p-3 overflow-y-auto max-h-[32rem]">
            <app-editor-node-panel
              [node]="editorService.selectedNode()"
              [preview]="editorService.selectedNodePreview()"
              [srid]="editorService.activeProject()?.default_srid ?? 4326"
              (configChange)="editorService.updateNodeConfig($event.nodeId, $event.config)"
              (fileImport)="onFileImport($event.nodeId, $event.file)"
            />
          </aside>
        </div>
      }
    </div>
  `,
})
export class EditorPage implements OnInit {
  readonly editorService = inject(EditorService);

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      await this.editorService.load();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors du chargement.';
      toast.error(message);
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
