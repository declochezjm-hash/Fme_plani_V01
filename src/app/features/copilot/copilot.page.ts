import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { Router } from "@angular/router";
import { UxModeService } from "@app/core/ux-mode/ux-mode.service";
import { LucideSparkles } from "@lucide/angular";
import { toast } from "ngx-sonner";
import { EditorService } from "../editor/editor.service";
import { CopilotChatComponent } from "./components/copilot-chat/copilot-chat.component";
import { CopilotService } from "./copilot.service";
import type { CopilotMessage, EtlPipelineJson } from "./copilot.types";

@Component({
	selector: "app-copilot-page",
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [LucideSparkles, CopilotChatComponent],
	template: `
    <div class="flex h-[calc(100dvh-4rem)] flex-col gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">
          <svg lucideSparkles class="size-6 text-primary"></svg>
          Copilot ETL
        </h1>
        <p class="text-muted-foreground text-sm mt-1">
          Mode conversation — utilisez l'espace guidé dans l'éditeur pour la vue carte.
        </p>
      </div>

      <div class="flex-1 min-h-0">
        <app-copilot-chat
          [showHeader]="false"
          [compactActions]="uxMode.mode() === 'novice'"
          (injectPipeline)="onInjectPipeline($event)"
          (runPipeline)="onRunPipeline($event)"
          (applyDiagnosis)="onApplyDiagnosis($event)"
        />
      </div>
    </div>
  `,
})
export class CopilotPage {
	readonly copilotService = inject(CopilotService);
	readonly uxMode = inject(UxModeService);
	private readonly editorService = inject(EditorService);
	private readonly router = inject(Router);

	async onInjectPipeline(pipeline: EtlPipelineJson): Promise<void> {
		try {
			await this.editorService.injectPipelineWithFile(
				pipeline,
				this.copilotService.pendingFile(),
			);
			toast.success("Pipeline injecté dans l'éditeur.");
			void this.router.navigate(["/editor"]);
		} catch (error: unknown) {
			const message =
				error instanceof Error ? error.message : "Erreur lors de l'injection.";
			toast.error(message);
		}
	}

	async onRunPipeline(pipeline: EtlPipelineJson): Promise<void> {
		try {
			await this.editorService.runPipelineFromChat(
				pipeline,
				this.copilotService.pendingFile(),
			);
			toast.success("Pipeline exécuté.");
			void this.router.navigate(["/editor"]);
		} catch (error: unknown) {
			const message =
				error instanceof Error ? error.message : "Erreur exécution.";
			toast.error(message);
		}
	}

	onApplyDiagnosis(message: CopilotMessage): void {
		const actionType = message.diagnosis?.actionType;
		if (actionType) {
			this.editorService.applyDiagnosisFix(actionType);
			toast.success("Correction appliquée.");
		}
	}
}
