# AI Tactical Match-Breaker

A football tactical analysis project built incrementally for the Inside the Game Hackathon.

## Project status

Phase 1 application skeleton: a React frontend calls a FastAPI backend, which checks its PostgreSQL connection.

## Structure

- `frontend/` — React and TypeScript client
- `backend/` — Python and FastAPI service
- `database/` — reserved for future database work
- `docs/` — project and technical documentation
- `scripts/` — development helper scripts
- `tests/` — automated checks

## Prerequisites

Install Git, Python 3, Node.js/npm, Docker Desktop with Docker Compose, and an editor such as VS Code. PostgreSQL will run in Docker Compose during local development; a separate local PostgreSQL installation is not required.

## Run locally with Docker Compose

1. Install Docker Desktop with Docker Compose and Node.js/npm.
2. Copy the example configuration into a local `.env` file:

   ```sh
   cp .env.example .env
   ```

   The sample PostgreSQL password is for local development only. The database URL is built from the PostgreSQL settings unless you set `DATABASE_URL` explicitly. PostgreSQL is available on localhost port `5433` for local database tools; change `POSTGRES_PORT` if that port is already in use. Never put real credentials in `.env.example` or commit `.env`.
3. Build and start the services:

   ```sh
   docker compose up --build
   ```

4. Open <http://localhost:5173>. The page requests `/api/health` through the Vite development proxy and displays whether FastAPI and PostgreSQL are available.
5. To check the API directly, open <http://localhost:8000/api/health>. A healthy response includes `"status":"healthy"` and `"database":"connected"`.
6. Stop the services with `Ctrl+C`, or from another terminal run:

   ```sh
   docker compose down
   ```

The Compose database volume is local development data and is not committed. `docker compose down` preserves it; add `--volumes` only when you intend to discard local database data. The health endpoint runs `SELECT 1` against PostgreSQL; it does not create application tables.

## Phase 2 database setup

Apply the schema migration and load the repeatable fictional demo dataset:

```sh
docker compose exec backend alembic upgrade head
docker compose exec backend python seed_demo.py
docker compose exec backend python -m pytest
```

The migration creates the team, player, current availability, match, match-player, and match-event tables. The seed script can be run again without duplicating its demo records. The tests use a temporary in-memory database; the commands above use PostgreSQL for the migration, seed, and live API checks.

Available read-only endpoints include:

- `GET /api/teams` and `GET /api/teams/{team_id}`
- `GET /api/players?team_id=...` and `GET /api/players/{player_id}`
- `GET /api/availability?status=...&team_id=...` and `GET /api/players/{player_id}/availability`
- `GET /api/matches?team_id=...` and `GET /api/matches/{match_id}`

Collection responses label the records as fictional demo data. Match participants include the team they represented in that match; the seed process checks that this team is the match's home or away team.

## Phase documents

- `AI_Tactical_Match_Breaker_Project_Blueprint.md` describes the product vision and phases.
- `AI_Tactical_Match_Breaker_Codex_Instructions.md` describes project-specific development rules.
