# Inside the Game Hackathon
# AI Tactical Match-Breaker & Ghost Simulation Suite

## 1. Project Vision

Build an AI-powered football tactical analysis platform that combines:

- Squad and injury/availability data
- Tactical formation visualization
- Historical match and physical-performance analysis
- AI-generated tactical reports
- Timestamped video evidence
- Computer-vision player tracking
- Counterfactual "ghost" simulations
- A future real-time voice tactician

The central workflow is:

**Football data + video -> analysis -> tactical explanation -> visual evidence -> what-if simulation**

The first goal is NOT to build every feature. We will build a reliable MVP in small phases and validate each phase before moving forward.

---

## 2. MVP Goal

The first working demo should allow a user to:

1. Select two teams.
2. View available players and basic attributes.
3. Build/view a tactical formation.
4. Store match/player data.
5. Run basic tactical/physical calculations.
6. Upload or select a match video.
7. Produce an AI tactical report.
8. Link report observations to timestamps.
9. Eventually visualize a "what-if" player movement using tracked coordinates.

For the hackathon, advanced computer vision and live voice interaction are stretch goals. A polished, reliable MVP is more important than having every planned feature.

---

## 3. System Architecture

### Frontend

**React + TypeScript**

Responsibilities:

- Dashboard
- Tactical board
- Squad selection
- Player availability
- Match analysis page
- Video player
- AI report display
- Future ghost-simulation overlay

Recommended supporting libraries can be selected during implementation, but avoid unnecessary dependencies.

### Backend

**Python + FastAPI**

Responsibilities:

- REST API
- Database access
- Tactical calculations
- Match/statistics processing
- Video-processing orchestration
- AI service integration
- Future computer-vision pipeline

### Database

Start with **PostgreSQL**.

Core entities:

- Team
- Player
- PlayerAttribute
- PlayerAvailability
- Match
- MatchTeam
- MatchPlayer
- MatchEvent
- TacticalAnalysis
- Video
- VideoEvidence
- Simulation

Use migrations from the beginning.

### Data/Analytics

- Python
- Pandas
- NumPy

Use these for:

- Distance comparisons
- Pace/sprint comparisons
- Match statistics
- Historical loss filtering
- Physical-gap calculations

### Computer Vision

Planned:

- OpenCV
- Ultralytics YOLO
- Player/object tracking
- Coordinate mapping

Do not build this first. Add it only after the core application works.

### AI

Planned:

- Azure OpenAI / compatible OpenAI API
- Semantic Kernel only if it provides a concrete benefit

AI responsibilities:

- Tactical report generation
- Explanation of detected weaknesses
- Linking observations to evidence
- Future conversational tactical assistant

### Deployment

- Docker
- Docker Compose for local development
- Cloud deployment later

---

## 4. Core Features

### A. Squad & Injury Management

Player record should eventually contain:

- Name
- Team
- Position
- Preferred foot
- Speed
- Acceleration
- Passing
- Dribbling
- Defensive ability
- Physical attributes
- Availability status

Availability:

- active
- doubtful
- injured
- suspended

Unavailable players should not be selectable for a starting XI.

---

### B. Tactical Formation Board

Users should be able to:

- Select a formation
- Place players into positions
- Move players
- View both teams
- Compare formations
- Identify structural spaces

Initial implementation can use a 2D tactical pitch rather than a sophisticated canvas engine.

Later:

- Drag-and-drop
- Pressing zones
- Passing lanes
- Defensive lines
- Space occupation
- Tactical stress testing

---

### C. Historical Match Analysis

The system should eventually answer questions such as:

- Which matches did Team X lose?
- What formations were used?
- Where did the opponent create chances?
- What physical metrics differed?
- Were there repeated weaknesses?

Potential calculations:

- Distance delta
- Sprint delta
- Possession delta
- Passing accuracy delta
- Shots/chances delta
- Defensive-event delta

Important: distinguish between raw observed data and AI interpretation.

---

### D. AI Tactical Report

Report structure should eventually contain:

1. Executive summary
2. Major tactical weaknesses
3. Evidence
4. Recommended tactical adjustment
5. Relevant players
6. Video timestamps
7. Confidence/limitations

Example:

> Weakness: space behind the left fullback  
> Evidence: 02:14–02:21  
> Suggested adjustment: reduce fullback height during transition

The system must not fabricate evidence or timestamps.

---

### E. Timestamped Video Evidence

A report observation should contain:

- Video ID
- Start timestamp
- End timestamp
- Description
- Related tactical issue

Clicking an observation should seek the video player to that timestamp.

---

### F. Ghost Simulation

The advanced simulation should:

1. Detect players.
2. Track player coordinates.
3. Estimate movement.
4. Modify a player's position/speed according to a hypothetical scenario.
5. Render a semi-transparent "ghost" player.
6. Compare the original and hypothetical trajectories.

Example:

> "What if the defender reacted 0.4 seconds earlier?"

This is a counterfactual visualization, not a claim that the simulated outcome definitely would have occurred.

---

## 5. Future Features

### Live Tactician Voice Mode

Example interaction:

> "Copilot, how do we stop their left winger?"

The system could combine:

- Live/near-live match data
- Current tactical state
- Squad availability
- AI reasoning
- Voice input/output

This is a later phase.

### Automated Scouting

Possible future integrations:

- Opta
- StatsBomb
- Other licensed football-data providers

Data licensing must be checked before using commercial datasets in a public/demo application.

---

## 6. Development Phases

### Phase 0 — Environment Setup

Install/configure:

- Git
- GitHub
- Python
- Node.js/npm
- Docker
- PostgreSQL
- VS Code or preferred IDE
- React/Vite
- FastAPI
- Virtual environment
- Environment-variable management

Create:

- frontend/
- backend/
- database/
- docs/
- scripts/
- tests/

Deliverable:

A clean repository where frontend, backend, database, and tests can start successfully.

---

### Phase 1 — Application Skeleton

Build:

- React frontend
- FastAPI backend
- PostgreSQL connection
- Docker Compose
- Health-check endpoint
- Basic frontend-to-backend request

Deliverable:

Frontend -> FastAPI -> PostgreSQL works locally.

---

### Phase 2 — Data Model

Implement database models and migrations.

Start with:

- Team
- Player
- PlayerAvailability
- Match
- MatchPlayer
- MatchEvent

Seed the database with a small, clearly labeled demo dataset.

Deliverable:

The application can retrieve teams, players, availability, and matches through the API.

---

### Phase 3 — Tactical Board

Implement:

- Pitch
- Formation selector
- Player placement
- Availability filtering
- Basic tactical comparison

Deliverable:

A user can construct a match-up such as:

Manchester United 3-4-3
vs.
Arsenal 4-3-2-1

using the demo data.

---

### Phase 4 — Analytics

Implement:

- Historical match filtering
- Loss filtering
- Physical-stat comparison
- Basic tactical metrics
- Analytics API endpoints

Deliverable:

The system produces reproducible calculations from stored data.

---

### Phase 5 — AI Report

Implement:

- AI service abstraction
- Prompt templates
- Tactical report schema
- Evidence references
- Error handling
- AI report UI

Deliverable:

A match can produce a structured tactical report based only on supplied data.

---

### Phase 6 — Video Evidence

Implement:

- Video upload/selection
- Video metadata
- Timestamped evidence
- Video player integration
- Report-to-video seeking

Deliverable:

Clicking a report observation jumps to the relevant timestamp.

---

### Phase 7 — Computer Vision

Implement experimentally:

- YOLO player detection
- Tracking
- Coordinate extraction
- Basic pitch mapping

Deliverable:

The application can track players in a controlled test video.

---

### Phase 8 — Ghost Simulation

Implement:

- Player trajectory representation
- Counterfactual movement
- Overlay rendering
- Original vs hypothetical comparison

Deliverable:

A short clip demonstrates a hypothetical tactical adjustment.

---

### Phase 9 — Hackathon Polish

Improve:

- UI
- Loading states
- Error handling
- Demo dataset
- Demo video
- Report presentation
- README
- Architecture diagram
- Demo script

---

## 7. Engineering Principles

1. Build one working feature at a time.
2. Do not implement future phases prematurely.
3. Never overwrite working code without explaining why.
4. Keep frontend and backend responsibilities separate.
5. Use typed API contracts.
6. Validate data at API boundaries.
7. Keep secrets in environment variables.
8. Never commit API keys.
9. Write tests for important calculations.
10. Prefer deterministic calculations over AI when a formula can solve the problem.
11. AI must not invent statistics, timestamps, injuries, or events.
12. Clearly label demo/mock data.
13. Keep commercial sports-data licensing separate from application logic.
14. Use Git commits after meaningful milestones.
15. Before large changes, explain the proposed files and architecture.
16. After changes, run tests/build/lint where available.
17. Keep the project runnable after every phase.

---

## 8. Initial Demo Data Strategy

Do not begin by trying to acquire a massive professional football database.

Start with:

- A small manually created dataset
- Clearly labeled demo player attributes
- A few demo matches
- A short legal/test video or user-provided footage

Later replace the demo data with licensed/open datasets where permitted.

---

## 9. Definition of Done

A phase is complete only when:

- The feature works locally.
- Existing functionality still works.
- Tests pass where applicable.
- The repository is clean.
- Documentation is updated.
- Environment variables/secrets are handled correctly.
- The user understands what changed.
- A Git commit can be made.

---

## 10. Current Priority

**Do not build the AI, YOLO, ghost simulation, or voice mode yet.**

Start with Phase 0.

The immediate objective is:

**Create a clean development environment and repository structure that can support the entire project.**

After Phase 0 works, stop and verify it before proceeding to Phase 1.
