# Interfaith Platform 

Last updated: 2026-04-11

This file tracks what is actually **shipped in code** vs what is still **truly remaining** for the current Interfaith platform.

---

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

### C. API endpoints implemented (Phase 1 baseline)
Implemented in: `apps/api/src/server.js`

- ✅ `GET /health`
- ✅ `GET /ready`
- ✅ `GET /version`
- ✅ `POST /auth/signup` (stub)
- ✅ `POST /auth/login` (session token + cookie)
- ✅ `GET /me` (cookie-based lookup)
- ✅ `POST /queue/join`
- ✅ `GET /queue/status`
- ✅ `POST /queue/leave`
- ✅ `GET /session/status`
- ✅ `POST /session/end`
- ✅ `GET /citation/search` (now real data-backed)
- ✅ `POST /reports`
- ✅ `GET /reports`
- ✅ `GET /reports/:id/history`
- ✅ `POST /reports/status`

### D. Persistence support
Implemented in: `apps/api/src/server.js`

- ✅ In-memory runtime stores for queue, reports, sessions
- ✅ Optional Postgres toggle: `USE_POSTGRES=true`
- ✅ Postgres init and table creation for:
  - `queue_entries`
  - `dialogue_sessions`
  - `moderation_reports`
  - `report_events`
  - `citations`
  - `auth_sessions`
  - `users`

### E. Frontend shell implemented (Sprint 1 + Phase 2 slices)
Implemented in: `apps/web/src/server.js`

- ✅ Auth UI and calls (`/auth/login`, `/auth/signup`, `/me`)
- ✅ Optional email/password auth UI for Postgres-backed flows
- ✅ Queue UI and calls (`/queue/join`, `/queue/status`, `/queue/leave`)
- ✅ Session status / end UI (`/session/status`, `/session/end`)
- ✅ Moderation report UI and call (`/reports`)
- ✅ Moderation admin UI:
  - list/filter reports (`/reports`)
  - timeline/history view (`/reports/:id/history`)
  - status update actions (`/reports/status`)
- ✅ Citation search UI and call (`/citation/search`)
  - renders normalized fields (`reference`, `canonical_key`, `translation`, `tradition`, `source`)
  - fallback label chain only as safety
- ✅ Diagnostics panel wired to `/health`, `/ready`, `/version`
- ✅ Build info panel wired to `/version` (commit, build, startedAt)

### F. Real citation data path (Sprint 2A)
Implemented in: `apps/api/src/server.js`, `apps/api/src/data/citations.json`

- ✅ Normalized citation schema:
  - `id`, `tradition`, `reference`, `canonical_key`, `text`, `translation`, `source`, `language`, `tags`
- ✅ Curated JSON dataset: `apps/api/src/data/citations.json`
- ✅ Postgres-backed `citations` table (auto-created when `USE_POSTGRES=true`)
- ✅ Seeder: JSON dataset is seeded into Postgres on first run when table is empty
- ✅ `/citation/search` implementation:
  - primary: Postgres query (`searchCitationsPostgres`)
  - fallback: in-memory dataset search (`searchCitationsInMemory`)
  - basic ranking by reference/text/tags and filters for `q`, `tradition`, `language`
- ✅ Frontend mapping uses real fields and avoids placeholder labels
- ✅ Smoke test assertions for citation search (no `undefined`, no `"Citation (Source)"` placeholder)

### G. Queue/session lifecycle (Sprint 2B core)
Implemented in: `apps/api/src/server.js`, `apps/web/src/server.js`, `apps/web/scripts/smoke-e2e.mjs`

- ✅ Session model with states: `active` and `ended` (plus implicit queued state)
- ✅ Immediate matcher on queue join with compatibility rules:
  - language match
  - compatible mode (`voice_only` vs `voice_then_video`)
- ✅ Session endpoints:
  - `GET /session/status`
  - `POST /session/end`
- ✅ Persistence of queue + sessions in Postgres (`queue_entries`, `dialogue_sessions`)
- ✅ Smoke test that creates two users, matches them, verifies `active`, then ends the session and verifies `ended`/`inactive` state

### H. Auth/session hardening (Sprint 2C core)
Implemented in: `apps/api/src/server.js`

- ✅ `auth_sessions` Postgres table for durable sessions
- ✅ `users` Postgres table for basic real-user auth
- ✅ Cookie-based session with `HttpOnly`, `SameSite=Lax`, max-age, and `Secure` in production
- ✅ `GET /me` driven by session cookie + DB-backed lookup
- ✅ Email/password signup and login path using Node `crypto.scrypt` when Postgres is enabled
- ✅ Stub `userId` login path preserved for local/dev flows
- ✅ Basic rate limiting on:
  - `/auth/login`
  - `/queue/join`
  - `/queue/leave`
  - `/reports`

> Note: the dev-friendly `userId` login path still exists and should be gated to local/dev only in production-facing environments.

### I. Moderation pipeline v1 (Sprint 2D core)
Implemented in: `apps/api/src/server.js`, `apps/web/src/server.js`

- ✅ Report ingestion (`POST /reports`) with category + notes
- ✅ Report list API (`GET /reports`) with optional status filter
- ✅ Report history events:
  - `report_events` table in Postgres
  - `GET /reports/:id/history` timeline
- ✅ Status workflow fields on reports:
  - `status`, `reviewer_note`, `reviewed_by`, `reviewed_at`
- ✅ Admin status update endpoint: `POST /reports/status`
- ✅ Admin UI:
  - list with status chips
  - detail timeline view
  - inline status/notes updates

### J. Observability and production plumbing
Implemented in: `apps/api/src/server.js`, `apps/web/src/server.js`, `docs/interfaith-deploy-restart-checklist.md`

- ✅ Structured JSON request logs with:
  - request id, method, path, status, duration, IP, user-agent, referer, userId
- ✅ Request-id surfaced to clients via `X-Request-Id` header
- ✅ `/health`, `/ready`, `/version` endpoints
- ✅ CORS allowlist driven by `CORS_ORIGINS` env var with validation + warnings
- ✅ Diagnostics panel in frontend hitting health/ready/version
- ✅ Deploy/restart checklist documenting:
  - DB-backed citation path
  - seeding commands
  - smoke tests
  - basic rollback plan

### K. Session continuity and memory
- ✅ `MEMORY.md` created and populated
- ✅ `memory/YYYY-MM-DD.md` files used for recaps

---

## 2) Remaining work (Phase 2 follow-ups)

Most of the original Phase 2 plan is **implemented**. What’s left are follow-ups and hardening, not greenfield features.

### Priority A — Real user model & auth hardening

Current state:
- UserId-based stub login remains available for dev/local flows.
- A basic email+password flow is implemented when Postgres is enabled (backed by a `users` table).

Planned work:
- [x] Introduce a `users` model in Postgres with:
  - `id`, `email`, `display_name`, `created_at`, etc.
- [x] Add a simple credential flow:
  - email + password using Node's `crypto.scrypt` (no external deps) with basic signup/login.
- [x] Wire `/auth/signup` and `/auth/login` to the real user model while keeping the `userId` stub path for dev.
- [x] Extend rate limiting and error payloads for auth to be deterministic and safe.
- [ ] Update docs to describe the auth model and any environment variables required.

### Priority B — Queue/matcher robustness

Current state:
- Queue + matching work and are persisted.
- Matching happens immediately on join with simple compatibility rules.

Follow-ups:
- [x] Add **queue entry expiry** (stale entries are dropped from matching based on `QUEUE_TTL_MS`).
- [x] Expose basic queue/matcher metrics in `/health` payload (`activeSessions`, `queueDepth`, `queue.ttlMs`).
- [ ] Consider exposing `expiredCount` as an additional metric if it becomes operationally useful.
- [ ] (Optional) Extract matcher into a small module to make later Redis/worker migration straightforward.

### Priority C — Moderation auto-flag heuristics

Current state:
- A lightweight heuristic layer runs on `POST /reports`, computing `severity` and `autoFlag` from `category` + `notes`.
- Heuristic output is stored with the report and surfaced in the admin UI as a severity chip.

Planned work:
- [x] Add a lightweight heuristic layer on `POST /reports`:
  - derive `severity` and `autoFlag` fields from `category` + `notes` (rule-based, no ML for now)
- [x] Store heuristic output with the report and show it in the admin UI (e.g. a small badge/chip).
- [x] Ensure auto-flagging never directly enforces bans/suspensions; it only prioritizes review.
- [x] Add tests for a few canonical examples (e.g. benign vs high-severity reports).

### Priority D — Ops & config cleanup

Current state:
- Core health/ready/version + deploy checklist are in place.

Follow-ups:
- [ ] Confirm production `CORS_ORIGINS` is locked down to real frontend origins (no wildcards in live envs).
- [ ] Confirm temporary DNS fallback paths (if any) have been removed from deploy/runtime config.
- [x] Add a short `docs/interfaith-ops-runbook.md` summarizing:
  - how to restart
  - where logs live
  - how to run smoke tests
  - how to roll back quickly

---

## 3) Updated definition of done for “Phase 2”

Phase 2 should be considered complete when:

- [ ] Real citation data path is live (already true) and documented as such.
- [x] Queue produces real matched sessions with lifecycle transitions, plus basic expiry handling.
- [x] Auth/session uses a real user model with durable sessions and rate limits (stub login still allowed only in dev/local flows today).
- [x] Moderation workflow includes an auto-flag heuristic layer surfaced in the admin UI.
- [ ] Health/ready/version + diagnostics are wired, and CORS/DNS/ops runbook are tightened for the live environment.

Once these are checked off, the next step is a **Phase 3** doc focused on product features rather than plumbing (e.g. richer dialogue UX, additional traditions, facilitator tooling).