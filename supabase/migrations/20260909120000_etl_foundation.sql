-- ==========================================
-- GisForge Desktop — ETL foundation (Sprint 1)
-- PostGIS + app schema + projects / transformers / executions
-- ==========================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;

CREATE SCHEMA IF NOT EXISTS app;

-- ==========================================
-- TABLES
-- ==========================================

CREATE TABLE app.project (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES administration.organization(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  default_srid     INTEGER NOT NULL DEFAULT 4326,
  pipeline_config  JSONB NOT NULL DEFAULT '{"version":1,"nodes":[],"edges":[]}'::jsonb,
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'active', 'archived')),
  created_by       UUID REFERENCES administration.user(uid) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE app.transformer (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES administration.organization(id) ON DELETE CASCADE,
  project_id       UUID NOT NULL REFERENCES app.project(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  transformer_type TEXT NOT NULL,
  config           JSONB NOT NULL DEFAULT '{}'::jsonb,
  srid             INTEGER,
  canvas_position  JSONB NOT NULL DEFAULT '{"x":0,"y":0}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE TABLE app.execution (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES administration.organization(id) ON DELETE CASCADE,
  project_id       UUID NOT NULL REFERENCES app.project(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  metrics          JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message    TEXT,
  created_by       UUID REFERENCES administration.user(uid) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- INDEXES
-- ==========================================

CREATE INDEX idx_project_organization ON app.project (organization_id);
CREATE INDEX idx_project_status ON app.project (status);
CREATE INDEX idx_transformer_project ON app.transformer (project_id);
CREATE INDEX idx_transformer_organization ON app.transformer (organization_id);
CREATE INDEX idx_execution_project ON app.execution (project_id);
CREATE INDEX idx_execution_organization ON app.execution (organization_id);
CREATE INDEX idx_execution_status ON app.execution (status);

-- ==========================================
-- TRIGGERS
-- ==========================================

CREATE TRIGGER tr_project_updated
  BEFORE UPDATE ON app.project
  FOR EACH ROW EXECUTE FUNCTION administration.set_updated_at();

CREATE TRIGGER tr_transformer_updated
  BEFORE UPDATE ON app.transformer
  FOR EACH ROW EXECUTE FUNCTION administration.set_updated_at();

-- ==========================================
-- ROW LEVEL SECURITY
-- ==========================================

ALTER TABLE app.project     ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.transformer ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.execution   ENABLE ROW LEVEL SECURITY;

-- ---- project ----
CREATE POLICY project_select ON app.project
  FOR SELECT TO authenticated
  USING (
    organization_id = administration.current_organization_id()
    OR administration.is_super_admin()
  );

CREATE POLICY project_insert ON app.project
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = administration.current_organization_id()
    AND (administration.is_organization_admin() OR administration.is_super_admin() OR administration.has_role('user'))
  );

CREATE POLICY project_update ON app.project
  FOR UPDATE TO authenticated
  USING (
    organization_id = administration.current_organization_id()
    AND (administration.is_organization_admin() OR administration.is_super_admin() OR administration.has_role('user'))
  )
  WITH CHECK (
    organization_id = administration.current_organization_id()
  );

CREATE POLICY project_delete ON app.project
  FOR DELETE TO authenticated
  USING (
    organization_id = administration.current_organization_id()
    AND (administration.is_organization_admin() OR administration.is_super_admin())
  );

-- ---- transformer ----
CREATE POLICY transformer_select ON app.transformer
  FOR SELECT TO authenticated
  USING (
    organization_id = administration.current_organization_id()
    OR administration.is_super_admin()
  );

CREATE POLICY transformer_insert ON app.transformer
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = administration.current_organization_id()
    AND EXISTS (
      SELECT 1 FROM app.project p
      WHERE p.id = project_id AND p.organization_id = administration.current_organization_id()
    )
  );

CREATE POLICY transformer_update ON app.transformer
  FOR UPDATE TO authenticated
  USING (organization_id = administration.current_organization_id())
  WITH CHECK (organization_id = administration.current_organization_id());

CREATE POLICY transformer_delete ON app.transformer
  FOR DELETE TO authenticated
  USING (organization_id = administration.current_organization_id());

-- ---- execution ----
CREATE POLICY execution_select ON app.execution
  FOR SELECT TO authenticated
  USING (
    organization_id = administration.current_organization_id()
    OR administration.is_super_admin()
  );

CREATE POLICY execution_insert ON app.execution
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = administration.current_organization_id());

CREATE POLICY execution_update ON app.execution
  FOR UPDATE TO authenticated
  USING (organization_id = administration.current_organization_id())
  WITH CHECK (organization_id = administration.current_organization_id());

-- ==========================================
-- GRANTS
-- ==========================================

GRANT USAGE ON SCHEMA app TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA app TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA app TO authenticated, service_role;

-- ==========================================
-- PUBLIC VIEWS
-- ==========================================

CREATE OR REPLACE VIEW public.projects WITH (security_invoker = true) AS
  SELECT
    id,
    organization_id,
    name,
    description,
    default_srid,
    pipeline_config,
    status,
    created_by,
    created_at,
    updated_at
  FROM app.project;

CREATE OR REPLACE VIEW public.transformers WITH (security_invoker = true) AS
  SELECT
    id,
    organization_id,
    project_id,
    name,
    transformer_type,
    config,
    srid,
    canvas_position,
    created_at,
    updated_at
  FROM app.transformer;

CREATE OR REPLACE VIEW public.executions WITH (security_invoker = true) AS
  SELECT
    id,
    organization_id,
    project_id,
    status,
    started_at,
    finished_at,
    metrics,
    error_message,
    created_by,
    created_at
  FROM app.execution;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transformers TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.executions TO authenticated, service_role;

-- ==========================================
-- RPC: execute ETL pipeline (Sprint 1 stub)
-- ==========================================

CREATE OR REPLACE FUNCTION public.execute_etl_pipeline(project_id_param UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, administration
AS $$
DECLARE
  v_project app.project%ROWTYPE;
  v_execution_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT *
  INTO v_project
  FROM app.project
  WHERE id = project_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Projet introuvable';
  END IF;

  IF v_project.organization_id <> administration.current_organization_id()
     AND NOT administration.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé au projet';
  END IF;

  INSERT INTO app.execution (
    organization_id,
    project_id,
    status,
    started_at,
    created_by
  )
  VALUES (
    v_project.organization_id,
    project_id_param,
    'running',
    now(),
    auth.uid()
  )
  RETURNING id INTO v_execution_id;

  -- Sprint 1: exécution simulée — le worker ETL sera branché plus tard
  UPDATE app.execution
  SET
    status = 'completed',
    finished_at = now(),
    metrics = jsonb_build_object(
      'rows_read', 0,
      'rows_written', 0,
      'duration_ms', 0,
      'message', 'Exécution simulée — Sprint 1'
    )
  WHERE id = v_execution_id;

  RETURN v_execution_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_etl_pipeline(UUID) TO authenticated, service_role;
