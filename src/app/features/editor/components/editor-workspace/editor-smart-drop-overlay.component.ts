import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { LucideUpload } from "@lucide/angular";

@Component({
	selector: "app-editor-smart-drop-overlay",
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [LucideUpload],
	template: `
    @if (visible()) {
      <div
        class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[1px]"
      >
        <div class="max-w-md rounded-lg border bg-card/95 px-6 py-5 text-center shadow-lg">
          <svg lucideUpload class="mx-auto mb-3 size-10 text-primary"></svg>
          <p class="text-sm font-semibold">{{ title() }}</p>
          <p class="mt-1 text-xs text-muted-foreground">{{ subtitle() }}</p>
          @if (fileLabel()) {
            <p class="mt-2 truncate text-xs font-medium text-primary">{{ fileLabel() }}</p>
          }
        </div>
      </div>
    }
  `,
})
export class EditorSmartDropOverlayComponent {
	readonly visible = input(false);
	readonly fileLabel = input<string | null>(null);
	readonly title = input("Déposer le fichier ZIP ou SHP pour l'analyser");
	readonly subtitle = input(
		"Formats : .zip, .shp, .gpkg, .geojson, .csv, .xlsx, .tif, .jpg, .png, .parquet",
	);
}
