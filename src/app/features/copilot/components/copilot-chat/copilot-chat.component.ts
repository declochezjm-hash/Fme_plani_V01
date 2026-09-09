import {
	ChangeDetectionStrategy,
	Component,
	inject,
	input,
	output,
	signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { CopilotActionChip } from "@app/core/services/copilot/file-inspection.types";
import { isSupportedDropFile } from "@app/core/services/copilot/smart-file-drop.utils";
import { EditorSmartDropOverlayComponent } from "@app/features/editor/components/editor-workspace/editor-smart-drop-overlay.component";
import { HlmButtonImports } from "@app/shared/ui/button";
import { HlmInputImports } from "@app/shared/ui/input";
import { HlmLabelImports } from "@app/shared/ui/label";
import { HlmSkeletonImports } from "@app/shared/ui/skeleton";
import {
	LucideBot,
	LucideImport,
	LucidePlay,
	LucideSend,
	LucideTrash2,
} from "@lucide/angular";
import { CopilotService } from "../../copilot.service";
import type { CopilotMessage, EtlPipelineJson } from "../../copilot.types";

@Component({
	selector: "app-copilot-chat",
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
		EditorSmartDropOverlayComponent,
	],
	template: `
    <div
      class="relative flex h-full min-h-0 flex-col rounded-lg border bg-card"
      (dragenter)="onDragEnter($event)"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      <app-editor-smart-drop-overlay [visible]="dragActive()" [fileLabel]="dragFileName()" />

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
              Déposez un fichier de données ici ou demandez : « Buffer 50m puis reproject Lambert-93 ».
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

                @if (message.fileInspection) {
                  <div class="mt-3 space-y-2 rounded-md border bg-background/80 p-3 text-xs text-foreground">
                    <div class="flex flex-wrap gap-1.5">
                      <span class="rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary">
                        {{ message.fileInspection.format }}
                      </span>
                      <span class="rounded-full bg-muted px-2 py-0.5">
                        {{ message.fileInspection.attributes.length }} attribut(s)
                      </span>
                      @if (message.fileInspection.hasGeometry) {
                        <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
                          {{ message.fileInspection.geometryType ?? 'Géométrie' }}
                        </span>
                      }
                      @if (message.fileInspection.hasCoordinates) {
                        <span class="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-700 dark:text-sky-300">
                          Coordonnées X/Y
                        </span>
                      }
                    </div>

                    @if (message.fileInspection.layers.length > 0) {
                      <p>
                        <span class="font-medium">Couches :</span>
                        {{ message.fileInspection.layers.join(', ') }}
                      </p>
                    }

                    @if (message.fileInspection.crs) {
                      <p><span class="font-medium">CRS :</span> {{ message.fileInspection.crs }}</p>
                    }

                    @if (message.fileInspection.attributes.length > 0) {
                      <p class="font-medium">Attributs détectés</p>
                      <ul class="grid grid-cols-2 gap-1">
                        @for (attr of message.fileInspection.attributes.slice(0, 8); track attr.name) {
                          <li class="truncate font-mono text-[10px] text-muted-foreground">
                            {{ attr.name }} <span class="text-foreground/60">({{ attr.type }})</span>
                          </li>
                        }
                      </ul>
                    }
                  </div>
                }

                @if (message.actionChips?.length) {
                  <div class="mt-3 flex flex-wrap gap-2">
                    @for (chip of message.actionChips; track chip.id) {
                      <button
                        hlmBtn
                        size="sm"
                        variant="outline"
                        type="button"
                        class="text-xs"
                        [disabled]="copilotService.loading()"
                        (click)="onActionChip(chip)"
                      >
                        {{ chip.label }}
                      </button>
                    }
                  </div>
                }

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
	readonly handleFileDropLocally = input(true);

	readonly injectPipeline = output<EtlPipelineJson>();
	readonly runPipeline = output<EtlPipelineJson>();
	readonly applyDiagnosis = output<CopilotMessage>();
	readonly messageSent = output<void>();
	readonly dataFileDropped = output<File>();
	readonly actionChipSelected = output<{
		actionId: string;
		label: string;
		pipeline: EtlPipelineJson;
	}>();

	readonly dragActive = signal(false);
	readonly dragFileName = signal<string | null>(null);

	private dragDepth = 0;

	promptText = "";

	clearConversation(): void {
		this.copilotService.clearConversation();
		this.promptText = "";
	}

	async sendMessage(): Promise<void> {
		const text = this.promptText.trim();
		if (!text) {
			return;
		}
		this.promptText = "";
		await this.copilotService.sendPrompt(text);
		this.messageSent.emit();
	}

	async onActionChip(chip: CopilotActionChip): Promise<void> {
		const pipeline = await this.copilotService.applyActionChip(
			chip.id,
			chip.label,
		);
		if (pipeline) {
			this.actionChipSelected.emit({
				actionId: chip.id,
				label: chip.label,
				pipeline,
			});
		}
	}

	onDragEnter(event: DragEvent): void {
		if (!this.hasFiles(event)) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		this.dragDepth += 1;
		this.dragActive.set(true);
		this.dragFileName.set(event.dataTransfer?.files?.[0]?.name ?? null);
	}

	onDragOver(event: DragEvent): void {
		if (!this.hasFiles(event)) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "copy";
		}
	}

	onDragLeave(event: DragEvent): void {
		if (!this.hasFiles(event)) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		this.dragDepth = Math.max(0, this.dragDepth - 1);
		if (this.dragDepth === 0) {
			this.dragActive.set(false);
			this.dragFileName.set(null);
		}
	}

	onDrop(event: DragEvent): void {
		const file = event.dataTransfer?.files?.[0];
		this.dragDepth = 0;
		this.dragActive.set(false);
		this.dragFileName.set(null);
		if (!file || !isSupportedDropFile(file)) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		if (!this.handleFileDropLocally()) {
			return;
		}
		this.dataFileDropped.emit(file);
	}

	private hasFiles(event: DragEvent): boolean {
		return !!event.dataTransfer?.types.includes("Files");
	}
}
