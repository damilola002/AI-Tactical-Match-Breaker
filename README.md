# AI Tactical Match-Breaker

A football tactical analysis project built incrementally for the Inside the Game Hackathon.

## Project status

The repository is being prepared in Phase 0. No application features have been implemented yet.

## Planned structure

- `frontend/` — React and TypeScript client (future phase)
- `backend/` — Python and FastAPI service (future phase)
- `database/` — database setup and migrations (future phase)
- `docs/` — project and technical documentation
- `scripts/` — development helper scripts
- `tests/` — automated checks

## Prerequisites

Install Git, Python 3, Node.js/npm, Docker Desktop with Docker Compose, and an editor such as VS Code. PostgreSQL will run in Docker Compose during local development; a separate local PostgreSQL installation is not required.

## Setup

1. Clone the repository and open its root directory.
2. Copy `.env.example` to `.env` and fill in values only when a feature requires them. Keep real credentials in `.env`; never commit it.
3. Create a Python environment when backend setup begins:

   ```sh
   python3 -m venv backend/.venv
   source backend/.venv/bin/activate
   ```

4. Frontend dependencies and Docker Compose services will be added in their implementation phases.

## Phase documents

- `AI_Tactical_Match_Breaker_Project_Blueprint.md` describes the product vision and phases.
- `AI_Tactical_Match_Breaker_Codex_Instructions.md` describes project-specific development rules.
