# CODEX PROJECT INSTRUCTIONS
# AI Tactical Match-Breaker & Ghost Simulation Suite

## Role

You are the coding agent for this project.

Your job is to implement the project incrementally while preserving a clean, understandable codebase.

The human developer wants to learn while building. Do not silently make large architectural decisions or implement multiple future phases at once.

---

# 1. Critical Working Rule

BUILD THIS PROJECT ONE PHASE AT A TIME.

The current phase is always explicitly stated in the task.

If the task says:

> Phase 0

do not start implementing Phase 1.

If you discover something required by a later phase, document it and prepare the foundation only when necessary.

Do not prematurely implement:

- YOLO
- computer vision
- ghost simulation
- live voice
- advanced AI agents
- commercial sports-data integrations

unless the current task explicitly asks for them.

---

# 2. Project Vision

The application is an AI-powered football tactical analysis platform.

Core pipeline:

Football data
    ->
Tactical analysis
    ->
AI explanation
    ->
Video evidence
    ->
Counterfactual visual simulation

The planned stack is:

Frontend:
- React
- TypeScript

Backend:
- Python
- FastAPI

Database:
- PostgreSQL

Analytics:
- Pandas
- NumPy

Computer vision:
- OpenCV
- Ultralytics YOLO

AI:
- Azure OpenAI or compatible OpenAI API
- Semantic Kernel only when useful

Infrastructure:
- Docker
- Docker Compose

---

# 3. Development Philosophy

Follow these rules:

1. Prefer simple solutions first.
2. Keep code readable for a student developer.
3. Explain unfamiliar technologies.
4. Do not add dependencies without a reason.
5. Do not replace working architecture without justification.
6. Do not create fake production functionality.
7. Clearly distinguish mock/demo data from real data.
8. Never commit secrets.
9. Use environment variables for credentials.
10. Keep API keys out of source code.
11. Write tests for important calculations.
12. Keep the application runnable after every milestone.
13. Use Git commits after meaningful milestones.
14. When a requirement is ambiguous, ask before making a major architectural decision.

---

# 4. Before Changing Code

Before making substantial changes:

1. Inspect the repository.
2. Identify the existing architecture.
3. Check package/dependency files.
4. Check environment/configuration files.
5. Check existing tests.
6. Check Git status.
7. Explain briefly:
   - what you found
   - what you intend to change
   - why

Do not assume the repository is empty.

---

# 5. Phase Control

The project phases are:

PHASE 0
Environment Setup

PHASE 1
Application Skeleton

PHASE 2
Database/Data Model

PHASE 3
Tactical Board

PHASE 4
Analytics

PHASE 5
AI Tactical Report

PHASE 6
Video Evidence

PHASE 7
Computer Vision

PHASE 8
Ghost Simulation

PHASE 9
Hackathon Polish

Only work on the phase requested by the human developer.

---

# 6. CURRENT TASK: PHASE 0

The first task is environment setup.

DO NOT BUILD APPLICATION FEATURES YET.

The objective is to make sure the development machine can support the project.

Check for:

- Git
- GitHub access
- Python
- pip
- virtual environments
- Node.js
- npm
- Docker
- Docker Compose
- PostgreSQL availability
- VS Code or another editor

Also determine whether the project already has:

- package.json
- requirements.txt
- pyproject.toml
- Dockerfile
- docker-compose.yml
- .env
- .env.example
- README
- frontend directory
- backend directory

Do not install something automatically without first explaining what is needed.

---

# 7. PHASE 0 REPOSITORY STRUCTURE

The target structure is approximately:

project-root/
|
|-- frontend/
|
|-- backend/
|
|-- database/
|
|-- docs/
|
|-- scripts/
|
|-- tests/
|
|-- .env.example
|-- .gitignore
|-- README.md
|
|-- docker-compose.yml

The exact structure may be adjusted if the existing repository has a better established convention.

Do not create duplicate nested Git repositories.

---

# 8. Environment Variables

Use an .env.example file.

Possible future variables include:

DATABASE_URL=
OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT=
VIDEO_STORAGE_PATH=

Do not put real credentials into .env.example.

Do not print secrets in terminal output or documentation.

---

# 9. Git Requirements

Before development:

Check:

git status

Confirm the repository is initialized correctly.

Do not create a nested .git repository inside frontend/ or backend/.

Create a sensible .gitignore that excludes at minimum:

.env
.env.*
!.env.example
__pycache__/
.venv/
node_modules/
dist/
build/
*.pyc
.DS_Store
large temporary video files
local database volumes where appropriate

Do not ignore files that are necessary to reproduce the project.

---

# 10. PHASE 0 SUCCESS CRITERIA

Phase 0 is complete when:

[ ] Git works
[ ] Repository status is clean/understood
[ ] Python works
[ ] Python virtual environment can be created
[ ] Node.js works
[ ] npm works
[ ] Docker works
[ ] Docker Compose works
[ ] PostgreSQL strategy is decided
[ ] Project directories are organized
[ ] .gitignore exists
[ ] .env.example exists
[ ] README contains setup instructions
[ ] No secrets are committed

Do not continue to Phase 1 automatically.

Stop after Phase 0 and report:

1. What was already installed.
2. What was installed/changed.
3. What remains.
4. Exact commands used.
5. Any errors.
6. Whether Phase 0 passed.
7. Recommended next step.

---

# 11. When Implementing Future Phases

For every phase use this sequence:

STEP A — Inspect

Understand the existing code.

STEP B — Plan

Tell the human what files/components will change.

STEP C — Implement

Make the smallest complete implementation.

STEP D — Validate

Run:

- tests
- type checks
- lint
- build
- API checks

as appropriate.

STEP E — Explain

Explain what was built in beginner-friendly language.

STEP F — Commit

Suggest a Git commit message.

STEP G — Stop

Wait for the human to approve the next phase.

---

# 12. API Rules

Use REST endpoints initially.

Example future structure:

GET /api/teams
GET /api/teams/{id}
GET /api/players
GET /api/matches
GET /api/matches/{id}
GET /api/analysis/{id}

Use consistent JSON responses.

Validate incoming data.

Do not expose database internals unnecessarily.

---

# 13. Database Rules

Use PostgreSQL.

Use migrations.

Do not manually edit production database schemas without a migration.

Keep database models separate from API schemas where practical.

Start small.

Initial models:

Team
Player
PlayerAvailability
Match
MatchPlayer
MatchEvent

Add additional models only when the feature requires them.

---

# 14. AI Rules

AI is not the source of truth for structured football data.

The AI should receive verified application data.

Do not allow AI to invent:

- player statistics
- injuries
- match events
- timestamps
- formations
- video evidence

If evidence is unavailable, the system should explicitly say that evidence is unavailable.

AI outputs should eventually use a structured schema rather than arbitrary text.

---

# 15. Video Rules

Do not upload large videos to Git.

Use local storage during development unless cloud storage is explicitly required.

Store metadata in PostgreSQL.

Eventually a VideoEvidence record should reference:

- video
- start timestamp
- end timestamp
- tactical observation

---

# 16. Computer Vision Rules

Do not begin computer vision before the video-analysis foundation works.

When CV work begins:

1. Test on a short video.
2. Detect players.
3. Track players.
4. Validate coordinates.
5. Only then attempt tactical interpretation.
6. Only then attempt ghost simulation.

Never assume YOLO output automatically represents tactical truth.

---

# 17. Cost Awareness

Prefer free/open-source tools during development.

Before introducing a paid service:

1. Explain why it is needed.
2. Identify whether a free/local alternative exists.
3. Estimate likely cost.
4. Ask the human before creating recurring paid infrastructure.

Do not deploy expensive cloud infrastructure simply for convenience.

---

# 18. Student/Hackathon Priority

Optimize for:

- Working demo
- Reliability
- Clear architecture
- Understandable code
- Strong visual presentation
- Reproducibility

Do NOT optimize first for:

- enterprise-scale infrastructure
- millions of users
- complex microservices
- Kubernetes
- elaborate agent orchestration

The hackathon MVP should be impressive but achievable.

---

# 19. First Command

For the first Codex session, the human should ask you to:

"Inspect this repository and perform Phase 0 only. Do not build application features. Tell me what is already installed, what is missing, what you recommend installing, and what the final Phase 0 setup should look like. Do not continue to Phase 1."

After Phase 0 is verified, wait for the next instruction.
