-- Sprint 4 : persistance réelle des exécutions ETL (métriques client)

CREATE OR REPLACE FUNCTION public.start_etl_execution(project_id_param UUID)
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

  SELECT * INTO v_project FROM app.project WHERE id = project_id_param;

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

  RETURN v_execution_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_etl_execution(
  execution_id_param UUID,
  status_param TEXT,
  metrics_param JSONB DEFAULT NULL,
  error_message_param TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, administration
AS $$
DECLARE
  v_execution app.execution%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT * INTO v_execution FROM app.execution WHERE id = execution_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exécution introuvable';
  END IF;

  IF v_execution.organization_id <> administration.current_organization_id()
     AND NOT administration.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé à l''exécution';
  END IF;

  UPDATE app.execution
  SET
    status = status_param,
    finished_at = now(),
    metrics = COALESCE(metrics_param, metrics),
    error_message = error_message_param
  WHERE id = execution_id_param;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_etl_pipeline(
  project_id_param UUID,
  metrics_param JSONB DEFAULT NULL,
  error_message_param TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, administration
AS $$
DECLARE
  v_execution_id UUID;
  v_status TEXT;
BEGIN
  v_execution_id := public.start_etl_execution(project_id_param);

  IF error_message_param IS NOT NULL THEN
    v_status := 'failed';
  ELSE
    v_status := 'completed';
  END IF;

  PERFORM public.complete_etl_execution(
    v_execution_id,
    v_status,
    metrics_param,
    error_message_param
  );

  RETURN v_execution_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_etl_execution(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_etl_execution(UUID, TEXT, JSONB, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_etl_pipeline(UUID, JSONB, TEXT) TO authenticated, service_role;
