import { ChangeDetectionStrategy, Component, HostBinding, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideAnvil,
  LucideLogOut,
  LucideSparkles,
  LucideUser,
  LucideWorkflow,
  LucideX,
} from '@lucide/angular';
import { toast } from 'ngx-sonner';
import { AuthService } from '@app/core/auth/auth.service';
import { HlmButtonImports } from '@app/shared/ui/button';

@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    @media (min-width: 1024px) {
      :host(.collapsed) .sidebar-label,
      :host(.collapsed) .sidebar-header-title,
      :host(.collapsed) .sidebar-footer-text {
        display: none;
      }

      :host(.collapsed) .sidebar-nav-link,
      :host(.collapsed) .sidebar-footer-button {
        justify-content: center;
        gap: 0;
        padding-inline: 0.5rem;
      }

      :host(.collapsed) .sidebar-profile-icon {
        display: block;
      }

      :host(.collapsed) .sidebar-profile-link {
        justify-content: center;
        min-height: 2.75rem;
        padding-inline: 0.5rem;
      }

      :host(.collapsed) .sidebar-header {
        justify-content: center;
        padding-inline: 0.5rem;
      }
    }
  `,
  imports: [
    RouterLink,
    RouterLinkActive,
    LucideAnvil,
    LucideSparkles,
    LucideWorkflow,
    LucideLogOut,
    LucideUser,
    LucideX,
    HlmButtonImports,
  ],
  template: `
    <div class="sidebar-header flex h-14 items-center justify-between gap-2 border-b border-sidebar-border px-4">
      <div class="flex items-center gap-2 min-w-0">
        <svg lucideAnvil class="size-5 shrink-0 text-sidebar-foreground"></svg>
        <span class="sidebar-header-title text-sm font-semibold truncate">GisForge</span>
      </div>
      <button
        hlmBtn
        variant="ghost"
        size="icon"
        class="lg:hidden text-sidebar-foreground"
        type="button"
        (click)="navigate.emit()"
      >
        <svg lucideX class="size-5"></svg>
      </button>
    </div>

    <div class="flex flex-1 flex-col min-h-0">
      <nav class="space-y-1 p-3">
        @if (!authService.mustChangePassword()) {
          <a
            routerLink="/copilot"
            routerLinkActive="bg-sidebar-accent text-sidebar-accent-foreground"
            class="sidebar-nav-link flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            [attr.title]="collapsed() ? 'Copilot ETL' : null"
            (click)="navigate.emit()"
          >
            <svg lucideSparkles class="size-4 shrink-0"></svg>
            <span class="sidebar-label truncate">Copilot ETL</span>
          </a>
          <a
            routerLink="/editor"
            routerLinkActive="bg-sidebar-accent text-sidebar-accent-foreground"
            class="sidebar-nav-link flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            [attr.title]="collapsed() ? 'Éditeur' : null"
            (click)="navigate.emit()"
          >
            <svg lucideWorkflow class="size-4 shrink-0"></svg>
            <span class="sidebar-label truncate">Éditeur</span>
          </a>
        }
      </nav>
    </div>

    <div class="mt-auto border-t border-sidebar-border p-3">
      <a
        routerLink="/my-profile"
        routerLinkActive="!text-sidebar-foreground"
        class="sidebar-profile-link mb-2 flex items-center gap-2 truncate px-3 text-xs text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
        [attr.title]="collapsed() ? displayName() : null"
        (click)="navigate.emit()"
      >
        <svg lucideUser class="sidebar-profile-icon hidden size-4 shrink-0"></svg>
        <span class="sidebar-label truncate">{{ displayName() }}</span>
      </a>
      @if (authService.mustChangePassword()) {
        <p class="sidebar-footer-text mb-2 px-3 text-xs text-amber-600 dark:text-amber-400">
          Changement de mot de passe requis
        </p>
      }
      <button
        hlmBtn
        variant="ghost"
        class="sidebar-footer-button w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent"
        type="button"
        [attr.title]="collapsed() ? 'Déconnexion' : null"
        [disabled]="authService.loading()"
        (click)="onSignOut()"
      >
        <svg lucideLogOut class="size-4 shrink-0"></svg>
        <span class="sidebar-label truncate">Déconnexion</span>
      </button>
    </div>
  `,
})
export class AppSidebarComponent {
  readonly collapsed = input(false);
  readonly authService = inject(AuthService);
  readonly navigate = output<void>();

  @HostBinding('class.collapsed')
  get isCollapsed(): boolean {
    return this.collapsed();
  }

  @HostBinding('class')
  get hostClasses(): string {
    const base =
      'flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200 ease-in-out shrink-0 w-60';
    if (this.collapsed()) {
      return `${base} lg:w-16`;
    }
    return base;
  }

  displayName(): string {
    const profile = this.authService.userProfile();
    if (profile?.display_name) {
      return profile.display_name;
    }
    if (profile?.email) {
      return profile.email;
    }
    return this.authService.user()?.email ?? '—';
  }

  async onSignOut() {
    try {
      await this.authService.signOut();
      toast.success('Déconnexion réussie.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la déconnexion.';
      toast.error(message);
    }
  }
}
