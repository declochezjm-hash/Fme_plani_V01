import { computed, inject, Injectable, signal } from '@angular/core';
import { AuthService } from '@app/core/auth/auth.service';
import { SupabaseService } from '@app/core/supabase/supabase.service';
import type { EtlPipelineJson } from '../copilot/copilot.types';
import type { CreateProjectDto, EtlProject, UpdateProjectDto } from './editor.types';

const DEFAULT_PIPELINE: EtlPipelineJson = {
  version: 1,
  nodes: [],
  edges: [],
};

@Injectable({ providedIn: 'root' })
export class EditorService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  private readonly _projects = signal<EtlProject[]>([]);
  private readonly _activeProjectId = signal<string | null>(null);
  private readonly _loading = signal(false);
  private readonly _saving = signal(false);

  readonly projects = this._projects.asReadonly();
  readonly activeProjectId = this._activeProjectId.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  readonly activeProject = computed(() => {
    const id = this._activeProjectId();
    if (!id) {
      return null;
    }
    return this._projects().find((project) => project.id === id) ?? null;
  });

  readonly pipeline = computed<EtlPipelineJson>(
    () => this.activeProject()?.pipeline_config ?? DEFAULT_PIPELINE,
  );

  setActiveProject(projectId: string | null): void {
    this._activeProjectId.set(projectId);
  }

  async load(): Promise<void> {
    this._loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) {
        throw error;
      }

      const mapped: EtlProject[] = (data ?? []).map((row) => ({
        id: row.id ?? '',
        organization_id: row.organization_id ?? '',
        name: row.name ?? '',
        description: row.description,
        default_srid: row.default_srid ?? 4326,
        pipeline_config: (row.pipeline_config as EtlPipelineJson) ?? DEFAULT_PIPELINE,
        status: (row.status as EtlProject['status']) ?? 'draft',
        created_by: row.created_by,
        created_at: row.created_at ?? '',
        updated_at: row.updated_at ?? '',
      }));

      this._projects.set(mapped);

      if (!this._activeProjectId() && mapped.length > 0) {
        this._activeProjectId.set(mapped[0].id);
      }
    } finally {
      this._loading.set(false);
    }
  }

  async create(dto: CreateProjectDto): Promise<EtlProject> {
    this._saving.set(true);
    try {
      const organizationId = this.auth.userProfile()?.organization_id;
      if (!organizationId) {
        throw new Error('Organisation introuvable.');
      }

      const { data, error } = await this.supabase
        .from('projects')
        .insert({
          name: dto.name,
          description: dto.description ?? null,
          default_srid: dto.default_srid ?? 4326,
          pipeline_config: dto.pipeline_config ?? DEFAULT_PIPELINE,
          organization_id: organizationId,
          created_by: this.auth.user()?.id ?? null,
          status: 'draft',
        })
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      await this.load();

      const created = this._projects().find((project) => project.id === data.id);
      if (created) {
        this._activeProjectId.set(created.id);
        return created;
      }

      throw new Error('Projet créé mais introuvable.');
    } finally {
      this._saving.set(false);
    }
  }

  async update(projectId: string, dto: UpdateProjectDto): Promise<void> {
    this._saving.set(true);
    try {
      const { error } = await this.supabase.from('projects').update(dto).eq('id', projectId);

      if (error) {
        throw error;
      }

      await this.load();
    } finally {
      this._saving.set(false);
    }
  }

  async savePipeline(projectId: string, pipeline: EtlPipelineJson): Promise<void> {
    await this.update(projectId, { pipeline_config: pipeline });
  }

  async execute(projectId: string): Promise<string> {
    const { data, error } = await this.supabase.rpc('execute_etl_pipeline', {
      project_id_param: projectId,
    });

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('Exécution lancée mais identifiant introuvable.');
    }

    return data as string;
  }
}
