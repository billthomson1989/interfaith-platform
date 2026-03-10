# Interfaith Platform — Completed vs Remaining

Last updated: 2026-03-10

## 1) Completed (verified in repository)

### A. Planning and architecture
- ✅ `INTERFAITH_PLATFORM_PHASE0.md`
- ✅ `INTERFAITH_PLATFORM_PRD_v0.1.md`
- ✅ `INTERFAITH_PLATFORM_ARCHITECTURE_v0.1.md`
- ✅ `README_INTERFAITH.md`
- ✅ `infrastructure/docker-compose.yml`
- ✅ `infrastructure/env.example`

### B. Codebase scaffold
- ✅ API app scaffold: `apps/api/`
- ✅ Web app scaffold: `apps/web/`
- ✅ Shared types package scaffold: `packages/types/`

### C. API endpoints implemented (Sprint 1 level)
Implemented in: `apps/api/src/server.js`

- ✅ `GET /health`
- ✅ `POST /auth/signup` (stub)
- ✅ `POST /auth/login` (session token + cookie)
- ✅ `GET /me` (cookie-based lookup)
- ✅ `POST /queue/join`
- ✅ `GET /queue/status`
- ✅ `POST /queue/leave`
- ✅ `GET /citation/search` (mock citation set)
- ✅ `POST /reports`
- ✅ `GET /reports`

### D. Persistence support
Implemented in: `apps/api/src/server.js`

- ✅ In-memory runtime stores for queue, reports, sessions
- ✅ Optional Postgres toggle: `USE_POSTGRES=true`
- ✅ Postgres init and table creation for:
  - `queue_entries`
  - `moderation_reports`

### E. Frontend shell implemented (Sprint 1)
Implemented in: `apps/web/src/server.js`

- ✅ Auth UI and calls (`/auth/login`, `/me`)
- ✅ Queue UI and calls (`/queue/join`, `/queue/status`, `/queue/leave`)
- ✅ Moderation report UI and call (`/reports`)
- ✅ Citation search UI and call (`/citation/search`)

### F. Test automation
- ✅ Browser smoke E2E test script: `apps/web/scripts/smoke-e2e.mjs`
- ✅ npm wiring for smoke test in `apps/web/package.json`

### G. Session continuity hardening
- ✅ `MEMORY.md` created and populated
- ✅ `memory/2026-03-10.md` recap created

---

## 2) Remaining work (Phase 2+)

## Priority 1 — Real citations (replace mock)

### Goal
Replace mock citation array with real citation data model + query path.

### Current gap
- `GET /citation/search` currently filters in-memory `sampleCitations`.

### Required changes
- [ ] Add citation storage model (DB table or curated dataset with normalized schema)
- [ ] Define citation schema fields:
  - `id`
  - `tradition`
  - `reference` (human label)
  - `canonical_key`
  - `text`
  - `translation`
  - `source`
  - optional: `language`, `tags`
- [ ] Replace API handler logic in `apps/api/src/server.js` with real query
- [ ] Update frontend rendering map in `apps/web/src/server.js` to consume real fields
- [ ] Add seed/import flow for initial citation corpus

### Target files
- `apps/api/src/server.js`
- `apps/web/src/server.js`
- `infrastructure/env.example` (if new vars needed)
- (new) migration/schema file(s)

---

## Priority 2 — Queue/session lifecycle (real matching)

### Goal
Move from queue storage to actual session lifecycle.

### Current gap
- Queue entry exists, but no matcher and no active session state machine.

### Required changes
- [ ] Add matcher service/loop (in-memory first or Redis-backed)
- [ ] Add session model and lifecycle states:
  - `queued -> matched -> active -> ended`
- [ ] Add timeout/expiry handling for stale queue entries
- [ ] Add endpoints for active session status/events
- [ ] Persist sessions in DB (or Redis + DB hybrid)

### Target files
- `apps/api/src/server.js` (or split service modules)
- (new) `apps/api/src/matcher/*`
- (new) persistence schema/migrations

---

## Priority 3 — Auth hardening

### Goal
Replace stub-level session handling with production-safe auth/session controls.

### Current gap
- Session map is in-memory only; login is userId-based stub.

### Required changes
- [ ] Introduce real user model + credentials/identity flow
- [ ] Move sessions from in-memory map to persistent/session store
- [ ] Implement signed token/session strategy with rotation/expiry
- [ ] Add auth rate limiting + abuse controls
- [ ] Secure cookie settings by environment (dev/prod)

### Target files
- `apps/api/src/server.js`
- `infrastructure/env.example`
- (new) auth/session modules

---

## Priority 4 — Moderation pipeline v1

### Goal
Turn report ingestion into actionable moderation workflow.

### Current gap
- Reports can be submitted/listed but no review workflow or admin tooling.

### Required changes
- [ ] Add report status workflow (`new`, `triaged`, `resolved`, etc.)
- [ ] Add admin review endpoint(s)
- [ ] Add basic auto-flag heuristics/rules
- [ ] Store reviewer actions and timestamps

### Target files
- `apps/api/src/server.js`
- (new) moderation service files
- (optional) admin UI surface

---

## Priority 5 — Observability and production cleanup

### Goal
Raise operational reliability and reduce deployment risk.

### Required changes
- [ ] Structured logs (request id, route, duration, status)
- [ ] Health/readiness checks expanded for dependencies
- [ ] Error tracking hook points
- [ ] Backup/rollback runbook
- [ ] Remove temporary DNS fallback after full propagation confidence
- [ ] Tighten CORS allowlist to production origins

### Target files
- `apps/api/src/server.js`
- `apps/web/src/server.js`
- `infrastructure/env.example`
- docs/runbooks under `docs/` (new)

---

## 3) Suggested execution order (ship slices)

1. Real citation data path (read-only, lowest risk)
2. Queue/session lifecycle foundation
3. Auth hardening + session persistence
4. Moderation review workflow
5. Observability + cleanup hardening

---

## 4) Definition of done for “Phase 2”

- [ ] Citation endpoint returns real normalized records from persistent source
- [ ] Queue can produce real matched sessions with lifecycle transitions
- [ ] Auth/session survives API restarts and enforces basic abuse controls
- [ ] Reports have triage/resolution states with audit trail
- [ ] Smoke test passes and includes at least one citation assertion on real data
- [ ] Production config no longer depends on temporary DNS fallback
