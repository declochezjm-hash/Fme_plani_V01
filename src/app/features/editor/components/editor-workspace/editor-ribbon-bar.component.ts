import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  LucideBookmarkPlus,
  LucideFilePlus,
  LucideFolderOpen,
  LucideMaximize2,
  LucideMoon,
  LucidePlay,
  LucideSave,
  LucideSquare,
  LucideSun,
  LucideZoomIn,
  LucideZoomOut,
} from '@lucide/angular';
import { HlmButtonImports } from '@app/shared/ui/button';

@Component({
  selector: 'app-editor-ribbon-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideFilePlus,
    LucideFolderOpen,
    LucideSave,
    LucidePlay,
    LucideSquare,
    LucideZoomIn,
    LucideZoomOut,
    LucideMaximize2,
    LucideBookmarkPlus,
    LucideSun,
    LucideMoon,
    HlmButtonImports,
  ],
  template: `
    <header
      class="flex h-10 shrink-0 items-center gap-1 border-b bg-card px-2 text-xs select-none overflow-x-auto"
    >
      <div class="flex items-center gap-0.5 border-r pr-2 mr-1">
        <button hlmBtn variant="ghost" size="sm" type="button" class="h-8 gap-1 px-2" (click)="newProject.emit()">
          <svg lucideFilePlus class="size-3.5"></svg>
          Nouveau
        </button>
        <button hlmBtn variant="ghost" size="sm" type="button" class="h-8 gap-1 px-2" (click)="openProject.emit()">
          <svg lucideFolderOpen class="size-3.5"></svg>
          Ouvrir un projet (.fmw, .json, .model3)
        </button>
        <button
          hlmBtn
          variant="ghost"
          size="sm"
          type="button"
          class="h-8 gap-1 px-2"
          [disabled]="saving() || !hasProject()"
          (click)="saveProject.emit()"
        >
          <svg lucideSave class="size-3.5"></svg>
          Enregistrer
        </button>
        <button
          hlmBtn
          variant="ghost"
          size="sm"
          type="button"
          class="h-8 gap-1 px-2"
          [disabled]="running() || !hasProject()"
          (click)="runProject.emit()"
        >
          <svg lucidePlay class="size-3.5"></svg>
          Exécuter
        </button>
        <button
          hlmBtn
          variant="ghost"
          size="sm"
          type="button"
          class="h-8 gap-1 px-2"
          [disabled]="!running()"
          (click)="stopProject.emit()"
        >
          <svg lucideSquare class="size-3.5"></svg>
          Stopper
        </button>
      </div>

      <div class="flex items-center gap-0.5 border-r pr-2 mr-1">
        <button hlmBtn variant="ghost" size="icon" type="button" class="size-8" title="Zoom +" (click)="zoomIn.emit()">
          <svg lucideZoomIn class="size-3.5"></svg>
        </button>
        <button hlmBtn variant="ghost" size="icon" type="button" class="size-8" title="Zoom -" (click)="zoomOut.emit()">
          <svg lucideZoomOut class="size-3.5"></svg>
        </button>
        <button
          hlmBtn
          variant="ghost"
          size="sm"
          type="button"
          class="h-8 gap-1 px-2"
          title="Vue globale"
          (click)="fitView.emit()"
        >
          <svg lucideMaximize2 class="size-3.5"></svg>
          Vue globale
        </button>
      </div>

      <div class="flex items-center gap-0.5 border-r pr-2 mr-1">
        <button hlmBtn variant="ghost" size="sm" type="button" class="h-8 px-2" (click)="addReader.emit()">
          + Reader
        </button>
        <button hlmBtn variant="ghost" size="sm" type="button" class="h-8 px-2" (click)="addWriter.emit()">
          + Writer
        </button>
        <button hlmBtn variant="ghost" size="sm" type="button" class="h-8 px-2" (click)="addTransformer.emit()">
          + Transformeur
        </button>
        <button hlmBtn variant="ghost" size="sm" type="button" class="h-8 gap-1 px-2" (click)="addGroup.emit()">
          <svg lucideBookmarkPlus class="size-3.5"></svg>
          + Groupe
        </button>
      </div>

      <div class="ml-auto flex items-center gap-1 pl-2">
        <button hlmBtn variant="ghost" size="sm" type="button" class="h-8 gap-1 px-2" (click)="toggleTheme.emit()">
          @if (dark()) {
            <svg lucideSun class="size-3.5"></svg>
            Clair
          } @else {
            <svg lucideMoon class="size-3.5"></svg>
            Sombre
          }
        </button>
        <div class="inline-flex rounded-md border p-0.5">
          <button
            hlmBtn
            type="button"
            size="sm"
            class="h-7 text-[10px] px-2"
            [variant]="uxMode() === 'novice' ? 'default' : 'ghost'"
            (click)="setUxMode.emit('novice')"
          >
            Novice
          </button>
          <button
            hlmBtn
            type="button"
            size="sm"
            class="h-7 text-[10px] px-2"
            [variant]="uxMode() === 'expert' ? 'default' : 'ghost'"
            (click)="setUxMode.emit('expert')"
          >
            Expert
          </button>
        </div>
      </div>
    </header>
  `,
})
export class EditorRibbonBarComponent {
  readonly dark = input(false);
  readonly uxMode = input<'novice' | 'expert'>('expert');
  readonly saving = input(false);
  readonly running = input(false);
  readonly hasProject = input(false);

  readonly newProject = output<void>();
  readonly openProject = output<void>();
  readonly saveProject = output<void>();
  readonly runProject = output<void>();
  readonly stopProject = output<void>();
  readonly zoomIn = output<void>();
  readonly zoomOut = output<void>();
  readonly fitView = output<void>();
  readonly addReader = output<void>();
  readonly addWriter = output<void>();
  readonly addTransformer = output<void>();
  readonly addGroup = output<void>();
  readonly toggleTheme = output<void>();
  readonly setUxMode = output<'novice' | 'expert'>();
}
