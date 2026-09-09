import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideBot, LucideImport, LucidePlay, LucideSend, LucideTrash2 } from '@lucide/angular';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmInputImports } from '@app/shared/ui/input';
import { HlmLabelImports } from '@app/shared/ui/label';
import { HlmSkeletonImports } from '@app/shared/ui/skeleton';
import type { CopilotMessage, EtlPipelineJson } from '../../copilot.types';
import { CopilotService } from '../../copilot.service';

@Component({
  selector: 'app-copilot-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LucideBot,
    LucideSend,
    LucideTrash2,
    LucideImport,
    LucidePlay,
    HlmButtonImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSkeletonImports,
  ],
  template: `
    <div class="flex h-full min-h-0 flex-col rounded-lg border bg-card">
      @if (showHeader()) {
        <div class="flex items-center justify-between border-b px-4 py-2">
          <p class="text-sm font-medium">Copilot ETL</p>
          @if (copilotService.hasMessages()) {
            <button hlmBtn variant="ghost" size="sm" type="button" (click)="clearConversation()">
              <svg lucideTrash2 class="size-4"></svg>
              Effacer
            </button>
          }
        </div>
      }

      <div class="flex-1 space-y-4 overflow-y-auto p-4 min-h-0">
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
                class="max-w-[95%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap"
                [class.bg-primary]="message.role === 'user'"
                [class.text-primary-foreground]="message.role === 'user'"
                [class.bg-muted]="message.role !== 'user'"
              >
                {{ message.content }}

                @if (message.diagnosis?.suggestion) {
                  <div class="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
                    <p class="font-medium text-destructive">Suggestion</p>
                    <p class="mt-1">{{ message.diagnosis?.suggestion }}</p>
                    @if (message.diagnosis?.actionLabel) {
                      <button
                        hlmBtn
                        size="sm"
                        variant="outline"
                        type="button"
                        class="mt-2"
                        (click)="applyDiagnosis.emit(message)"
                      >
                        {{ message.diagnosis?.actionLabel }}
                      </button>
                    }
                  </div>
                }

                @if (message.pipeline) {
                  <div class="mt-3 flex flex-wrap gap-2">
                    @if (compactActions()) {
                      <button
                        hlmBtn
                        size="sm"
                        type="button"
                        (click)="runPipeline.emit(message.pipeline!)"
                      >
                        <svg lucidePlay class="size-4"></svg>
                        Lancer
                      </button>
                    }
                    <button
                      hlmBtn
                      size="sm"
                      [variant]="compactActions() ? 'outline' : 'default'"
                      type="button"
                      (click)="injectPipeline.emit(message.pipeline!)"
                    >
                      <svg lucideImport class="size-4"></svg>
                      {{ compactActions() ? 'Appliquer' : 'Injecter dans le Canvas' }}
                    </button>
                  </div>
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

      <form class="flex items-end gap-2 border-t p-4" (ngSubmit)="sendMessage()">
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
        <button hlmBtn type="submit" [disabled]="copilotService.loading() || !promptText.trim()">
          <svg lucideSend class="size-4"></svg>
          Envoyer
        </button>
      </form>
    </div>
  `,
})
export class CopilotChatComponent {
  readonly copilotService = inject(CopilotService);

  readonly showHeader = input(true);
  readonly compactActions = input(false);

  readonly injectPipeline = output<EtlPipelineJson>();
  readonly runPipeline = output<EtlPipelineJson>();
  readonly applyDiagnosis = output<CopilotMessage>();
  readonly messageSent = output<void>();

  promptText = '';

  clearConversation(): void {
    this.copilotService.clearConversation();
    this.promptText = '';
  }

  async sendMessage(): Promise<void> {
    const text = this.promptText.trim();
    if (!text) {
      return;
    }
    this.promptText = '';
    await this.copilotService.sendPrompt(text);
    this.messageSent.emit();
  }
}
