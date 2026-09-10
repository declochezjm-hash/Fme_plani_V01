# 4GIx — Socle technique (v0.1)

Monorepo ETL/ELT géospatial : canvas type n8n (React Flow), API FastAPI, PostGIS.

## Démarrage rapide

```bash
cd docker
docker compose up --build
```

| Service   | URL |
|-----------|-----|
| Frontend  | http://localhost:5173 |
| Backend   | http://localhost:8000/docs |
| PostGIS   | `localhost:5432` — user `4gix_user`, password `4gix_password`, DB `4gix_db` |

## Développement local (sans Docker)

**Backend**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

## API clés

- `GET /health`
- `GET /api/v1/nodes/catalog` — catalogue des nœuds 4GIx
- `POST /api/v1/execution/run` — body `{ "workflow": { "nodes": [...], "connections": {...} } }` (format n8n)
- `WS /api/v1/execution/ws` — exécution avec événements `node_finished`

## Documentation

Voir [doc/STRUCTURE_REPORT.md](doc/STRUCTURE_REPORT.md) pour l’arborescence détaillée et les choix d’architecture.
