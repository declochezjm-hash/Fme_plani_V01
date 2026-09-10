-- 4GIx — initialisation PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS gix;

COMMENT ON SCHEMA gix IS 'Schéma métier 4GIx (workflows, exécutions, catalogues)';
