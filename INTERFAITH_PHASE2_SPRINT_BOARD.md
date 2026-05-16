# Interfaith Platform — Phase 2 Sprint Board

Last updated: 2026-04-11
Scope: document Phase 2 slices that shipped, and call out the remaining follow-ups.

Phase 2 was originally planned as four sprints (2A–2D). The **core of all four has now been implemented and deployed**; what remains are hardening and follow-up tasks.

For detailed status, see also: `INTERFAITH_COMPLETED_VS_REMAINING.md`.

---

## Sprint 2A — Real citation data (DONE)

### Outcomes (shipped)
- `/citation/search` returns real records from:
  - a curated JSON dataset, and
  - a Postgres `citations` table when `USE_POSTGRES=true`.
- Frontend renders stable citation labels from normalized fields.

### What shipped
- Citation schema: `id`, `tradition`, `reference`, `canonical_key`, `text`, `translation`, `source`, `language`, `tags`.
- JSON dataset: `apps/api/src/data/citations.json`.
- Postgres table `citations` auto-created and seeded from JSON when empty.
- API handler replaced with real query logic:
  - Postgres-backed search with `q`, `tradition`, `language`, `limit`.
  - In-memory fallback using the JSON dataset.
- Frontend mapping uses `reference` with fallbacks and avoids placeholder labels.
- Smoke/e2e tests assert that citation results are non-placeholder and non-`undefined`.

### Remaining follow-ups
- None specific to citations; further work is tracked under global ops/auth priorities.

---

## Sprint 2B — Queue/session lifecycle (core DONE)

### Outcomes (shipped)
- Queue transitions into actual matched sessions.
- Session states tracked and queryable via API + UI.

### What shipped
- Session model with `active` and `ended` states stored in Postgres (`dialogue_sessions`).
- Persistent queue entries in `queue_entries`.
- Deterministic matcher on `/queue/join`:
  - language match
  - compatible modes (`voice_only`, `voice_then_video`).
- Session endpoints:
  - `GET /session/status`
  - `POST /session/end`.
- Frontend wiring for join/leave/status/end.
- Smoke test flow:
  - user1 joins queue (queued, not matched)
  - user2 joins queue (matched -> active session)
  - verify both users see an active session
  - end the session and verify `ended`/inactive state.

### Remaining follow-ups
- Queue entry expiry and health metrics are now in place, including `queue.expiredCount`.
- Optionally extract matcher logic into its own module to ease future Redis/worker migration.

---

## Sprint 2C — Auth/session hardening (core DONE; identity still TODO)

### Outcomes (shipped)
- Session/auth survives API restarts via Postgres-backed `auth_sessions`.
- Cookie/session policy is environment-aware.
- Basic abuse controls (rate limiting) are in place on critical endpoints.

### What shipped
- `auth_sessions` Postgres table with token + user id + timestamps.
- `interfaith_session` cookie with `HttpOnly`, `SameSite=Lax`, `Secure` in production, and 24h lifetime.
- `GET /me` endpoint backed by cookie + DB lookup.
- Rate limiting around:
  - `/auth/login`
  - `/queue/join`
  - `/queue/leave`
  - `/reports`.

### Remaining follow-ups
- Keep the new `users` table and scrypt-based email/password auth path documented and tested.
- The userId-based stub login is now gated to local/dev only.
- Continue tightening docs and env configuration as deployment details evolve.

---

## Sprint 2D — Moderation workflow + ops cleanup (core DONE; heuristics TODO)

### Outcomes (shipped)
- Reports are triage-able workflow items.
- There is a basic moderation admin surface.
- Production safety and diagnostics are significantly better than Phase 1.

### What shipped
- `moderation_reports` table with status fields (`status`, `reviewer_note`, `reviewed_by`, `reviewed_at`).
- `report_events` table to track timeline of changes.
- API endpoints:
  - `POST /reports` (ingest reports)
  - `GET /reports` (list/filter)
  - `GET /reports/:id/history` (timeline)
  - `POST /reports/status` (moderation updates).
- Frontend admin UI:
  - list view with status chips
  - detail timeline with history events
  - inline status + reviewer note updates.
- Structured JSON logging with request IDs.
- `/health`, `/ready`, `/version` endpoints and a diagnostics panel in the UI.
- Deploy/restart checklist with smoke tests and rollback notes.

### Remaining follow-ups
- Keep the new **auto-flag heuristics** tuned and documented:
  - `severity`/`autoFlag` are now derived from category + notes using simple rules.
  - they are surfaced in the admin UI as hints, not automatic actions.
- Production CORS/runtime guidance and the ops runbook are now in place.
- Remaining live-env work is mainly operational confirmation at deploy time, not missing code paths.

---

## Cross-sprint guardrails (still valid)

- Keep public API contracts backward compatible where possible.
- Ship in small merges; run smoke e2e before each deploy.
- Avoid large refactors and feature additions in the same commit.
- Record major outcomes in `memory/YYYY-MM-DD.md` and update `MEMORY.md` for durable continuity.

---

## Immediate next actions (as of 2026-04-11)

1. **Live-env operational confirmation**
   - Confirm production env vars match the tightened docs (`CORS_ORIGINS`, `ALLOW_DEV_STUB_AUTH`, `ADMIN_USER_IDS`, `QUEUE_TTL_MS`).
   - Confirm the frontend runtime keeps `apiFallback: ""` unless intentionally needed during an incident.

2. **Moderation heuristics tuning**
   - Tune keyword/category rules and document expected behavior if false positives/negatives show up in real usage.

3. **Phase 3 planning**
   - Once live-env confirmation is done, move to a Phase 3 doc focused on richer product features rather than plumbing.

At this point, most remaining Phase 2 work is operational confirmation rather than core implementation.