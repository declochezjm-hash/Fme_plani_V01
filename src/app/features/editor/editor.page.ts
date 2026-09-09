import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucidePlay, LucidePlus, LucideWorkflow } from '@lucide/angular';
import { toast } from 'ngx-sonner';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmInputImports } from '@app/shared/ui/input';
import { HlmLabelImports } from '@app/shared/ui/label';
import { HlmSkeletonImports } from '@app/shared/ui/skeleton';
import { EditorService } from './editor.service';

@Component({
  selector: 'app-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LucidePlay,
    LucidePlus,
    LucideWorkflow,
    HlmButtonImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSkeletonImports,
  ],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">
            <svg lucideWorkflow class="size-6 text-primary"></svg>
            Éditeur de pipeline
          </h1>
          <p class="text-muted-foreground text-sm mt-1">
            Canvas nodal pour composer et exécuter vos flux ETL spatiaux.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button hlmBtn variant="outline" type="button" (click)="createProject()">
            <svg lucidePlus class="size-4"></svg>
            Nouveau projet
          </button>
          @if (editorService.activeProject(); as project) {
            <button
              hlmBtn
              type="button"
              [disabled]="editorService.saving()"
              (click)="executeProject(project.id)"
            >
              <svg lucidePlay class="size-4"></svg>
              Exécuter
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
        <div class="flex flex-col gap-4 lg:flex-row">
          <aside class="w-full lg:w-64 shrink-0 space-y-2">
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

            @if (editorService.projects().length === 0) {
              <p class="text-xs text-muted-foreground">
                Aucun projet. Créez-en un pour démarrer.
              </p>
            }
          </aside>

          <div class="flex-1 min-h-[24rem] rounded-lg border bg-card relative overflow-hidden">
            @if (editorService.activeProject(); as project) {
              <div class="absolute inset-0 bg-[radial-gradient(circle,_var(--border)_1px,_transparent_1px)] [background-size:20px_20px]">
                @for (node of editorService.pipeline().nodes; track node.id) {
                  <div
                    class="absolute rounded-md border bg-background px-3 py-2 text-xs shadow-sm min-w-[8rem]"
                    [style.left.px]="node.position.x"
                    [style.top.px]="node.position.y"
                  >
                    <p class="font-medium">{{ node.label }}</p>
                    <p class="text-muted-foreground">{{ node.type }}</p>
                  </div>
                }
              </div>
              <div class="absolute bottom-0 left-0 right-0 border-t bg-background/90 px-4 py-2 text-xs text-muted-foreground">
                {{ project.name }} — EPSG:{{ project.default_srid }} —
                {{ editorService.pipeline().nodes.length }} nœud{{ editorService.pipeline().nodes.length > 1 ? 's' : '' }}
              </div>
            } @else {
              <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
                Sélectionnez ou créez un projet.
              </div>
            }
          </div>
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
      toast.success('Projet créé.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la création.';
      toast.error(message);
    }
  }

  async executeProject(projectId: string): Promise<void> {
    try {
      const executionId = await this.editorService.execute(projectId);
      toast.success(`Exécution lancée (${executionId.slice(0, 8)}…).`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de l\'exécution.';
      toast.error(message);
    }
  }
}
