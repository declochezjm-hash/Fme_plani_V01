import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideBot, LucideImport, LucideSend, LucideSparkles, LucideTrash2 } from '@lucide/angular';
import { toast } from 'ngx-sonner';
import { EditorService } from '../editor/editor.service';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmInputImports } from '@app/shared/ui/input';
import { HlmLabelImports } from '@app/shared/ui/label';
import { HlmSkeletonImports } from '@app/shared/ui/skeleton';
import type { CopilotMode } from './copilot.types';
import { CopilotService } from './copilot.service';

@Component({
  selector: 'app-copilot-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LucideBot,
    LucideSend,
    LucideSparkles,
    LucideTrash2,
    LucideImport,
    HlmButtonImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSkeletonImports,
  ],
  template: `
    <div class="flex h-[calc(100dvh-4rem)] flex-col gap-4">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">
            <svg lucideSparkles class="size-6 text-primary"></svg>
            Copilot ETL
          </h1>
          <p class="text-muted-foreground text-sm mt-1">
            Décrivez votre flux en langage naturel — propulsé par Cursor Composer 2.5.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="inline-flex rounded-md border p-0.5">
            <button
              hlmBtn
              type="button"
              size="sm"
              [variant]="copilotService.mode() === 'novice' ? 'default' : 'ghost'"
              (click)="setMode('novice')"
            >
              Guidé
            </button>
            <button
              hlmBtn
              type="button"
              size="sm"
              [variant]="copilotService.mode() === 'expert' ? 'default' : 'ghost'"
              (click)="setMode('expert')"
            >
              Expert
            </button>
          </div>
          @if (copilotService.hasMessages()) {
            <button hlmBtn variant="outline" size="sm" type="button" (click)="clearConversation()">
              <svg lucideTrash2 class="size-4"></svg>
              Effacer
            </button>
          }
        </div>
      </div>

      <div class="flex min-h-0 flex-1 flex-col rounded-lg border bg-card">
        <div class="flex-1 space-y-4 overflow-y-auto p-4">
          @if (!copilotService.hasMessages()) {
            <div class="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <svg lucideBot class="size-10 opacity-40"></svg>
              <p class="text-sm max-w-md">
                Exemples : « Buffer 50m puis reproject Lambert-93 » ou « Découper par emprise ».
              </p>
            </div>
          } @else {
            @for (message of copilotService.messages(); track message.id) {
              <div
                class="flex"
                [class.justify-end]="message.role === 'user'"
                [class.justify-start]="message.role !== 'user'"
              >
                <div
                  class="max-w-[85%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap"
                  [class.bg-primary]="message.role === 'user'"
                  [class.text-primary-foreground]="message.role === 'user'"
                  [class.bg-muted]="message.role !== 'user'"
                >
                  {{ message.content }}
                  @if (message.plainFrenchSummary && copilotService.mode() === 'expert' && message.pipeline) {
                    <p class="mt-2 text-xs text-muted-foreground border-t pt-2">
                      {{ message.plainFrenchSummary }}
                    </p>
                  }
                  @if (message.pipeline) {
                    <button
                      hlmBtn
                      size="sm"
                      type="button"
                      class="mt-3"
                      (click)="injectPipeline(message.pipeline!)"
                    >
                      <svg lucideImport class="size-4"></svg>
                      Injecter dans le Canvas
                    </button>
                  }
                </div>
              </div>
            }
          }

          @if (copilotService.loading()) {
            <div class="space-y-2">
              <div hlmSkeleton class="h-12 w-2/3"></div>
              <div hlmSkeleton class="h-8 w-1/2"></div>
            </div>
          }
        </div>

        <form
          class="flex items-end gap-2 border-t p-4"
          (ngSubmit)="sendMessage()"
        >
          <div class="flex-1 space-y-1">
            <label hlmLabel for="copilot-prompt" class="sr-only">Votre demande</label>
            <input
              hlmInput
              id="copilot-prompt"
              type="text"
              placeholder="Décrivez la transformation souhaitée…"
              [(ngModel)]="promptText"
              name="promptText"
              [disabled]="copilotService.loading()"
              class="w-full"
              autocomplete="off"
            />
          </div>
          <button
            hlmBtn
            type="submit"
            [disabled]="copilotService.loading() || !promptText.trim()"
          >
            <svg lucideSend class="size-4"></svg>
            Envoyer
          </button>
        </form>
      </div>
    </div>
  `,
})
export class CopilotPage {
  readonly copilotService = inject(CopilotService);
  private readonly editorService = inject(EditorService);
  private readonly router = inject(Router);
  promptText = '';

  setMode(mode: CopilotMode): void {
    this.copilotService.setMode(mode);
  }

  clearConversation(): void {
    this.copilotService.clearConversation();
    this.promptText = '';
  }

  injectPipeline(pipeline: import('./copilot.types').EtlPipelineJson): void {
    this.editorService.injectPipeline(pipeline);
    toast.success('Pipeline injecté dans l\'éditeur.');
    void this.router.navigate(['/editor']);
  }

  async sendMessage(): Promise<void> {
    const text = this.promptText.trim();
    if (!text) {
      return;
    }

    this.promptText = '';

    try {
      await this.copilotService.sendPrompt(text);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors du traitement.';
      toast.error(message);
    }
  }
}
