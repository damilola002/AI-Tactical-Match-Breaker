# AI Tactical Match-Breaker

A football tactical analysis project built incrementally for the Inside the Game Hackathon.

## Project status

Phase 6A foundation: the application has its existing React/FastAPI/PostgreSQL features plus private local video storage metadata. HTTP upload, playback, annotations, and report links are planned for later Phase 6 steps.

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

## Phase 6A video storage foundation

Phase 6A adds database metadata and a private local storage helper only. It does not expose upload, video playback, or annotation endpoints yet. Docker Compose stores video files in the ignored host directory `./data/videos/`, mounted at `/app/data/videos` inside the backend container. Files persist across backend container recreation. If the Compose video-storage mount is introduced or changed, existing backend containers must be recreated to receive the mount and `VIDEO_STORAGE_PATH` setting; run `docker compose up --build -d backend`. This recreates only the backend service and preserves the PostgreSQL volume. Compose does not support custom storage paths. The storage directory and its parent must remain controlled by trusted processes and must not be group- or world-writable. The backend image currently runs as container root; treat it and any process with equivalent filesystem access as trusted. This deployment binds services to localhost and is not suitable for public exposure without authentication and additional hardening. It does not protect against a malicious host administrator, privileged container process, or another actor with equivalent filesystem control. Storage checks reject symlinked roots, writable-by-group/other roots, and non-private staging directories. New staging directories use mode `0700`, media files use mode `0600`, and existing host directories are never recursively chmodded or chowned. `MAX_VIDEO_UPLOAD_BYTES` defaults to 524288000 bytes and `VIDEO_ALLOWED_FORMATS` is `mp4,webm`. Video bytes are not stored in PostgreSQL or Git. Duplicate content is hashed but not automatically deduplicated in Phase 6A; each accepted stream receives a separate generated storage key. Promotion uses atomic no-overwrite hard links and fails closed if unavailable. Cleanup is diagnostic-only: candidate lists are advisory, never delete files, and are not run automatically at startup. Basic file signatures only identify an expected container format and do not prove that a video is safe or decodable.

Available read-only endpoints include:

- `GET /api/teams` and `GET /api/teams/{team_id}`
- `GET /api/players?team_id=...` and `GET /api/players/{player_id}`
- `GET /api/availability?status=...&team_id=...` and `GET /api/players/{player_id}/availability`
- `GET /api/matches?team_id=...` and `GET /api/matches/{match_id}`

Collection responses label the records as fictional demo data. Match participants include the team they represented in that match; the seed process checks that this team is the match's home or away team.

## Phase documents

- `AI_Tactical_Match_Breaker_Project_Blueprint.md` describes the product vision and phases.
- `AI_Tactical_Match_Breaker_Codex_Instructions.md` describes project-specific development rules.
