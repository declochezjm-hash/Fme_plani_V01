import { inject, Injectable, signal } from '@angular/core';
import { AuthService } from '@app/core/auth/auth.service';
import { SupabaseService } from '@app/core/supabase/supabase.service';
import type { UserOrganization } from './profile.types';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  private readonly _saving = signal(false);
  private readonly _organizationLoading = signal(false);
  private readonly _currentOrganization = signal<UserOrganization | null>(null);

  readonly saving = this._saving.asReadonly();
  readonly organizationLoading = this._organizationLoading.asReadonly();
  readonly currentOrganization = this._currentOrganization.asReadonly();

  async loadCurrentOrganization(): Promise<void> {
    const organizationId = this.auth.currentOrganizationId();
    if (!organizationId) {
      this._currentOrganization.set(null);
      return;
    }

    this._organizationLoading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data?.id || !data.name || !data.slug) {
        this._currentOrganization.set(null);
        return;
      }

      this._currentOrganization.set({
        id: data.id,
        name: data.name,
        slug: data.slug,
        is_active: data.is_active ?? true,
        created_at: data.created_at ?? '',
        updated_at: data.updated_at ?? '',
      });
    } finally {
      this._organizationLoading.set(false);
    }
  }

  async updateDisplayName(displayName: string): Promise<void> {
    this._saving.set(true);
    try {
      const { error } = await this.supabase.rpc('update_own_profile', {
        p_display_name: displayName,
      });

      if (error) {
        throw error;
      }

      await this.auth.refreshProfile();
    } finally {
      this._saving.set(false);
    }
  }

  async updatePassword(newPassword: string): Promise<void> {
    this._saving.set(true);
    try {
      const { error } = await this.supabase.auth.updateUser({ password: newPassword });

      if (error) {
        throw error;
      }

      const { error: clearError } = await this.supabase.rpc('clear_must_change_password');

      if (clearError) {
        throw clearError;
      }

      await this.auth.refreshProfile();
    } finally {
      this._saving.set(false);
    }
  }
}
