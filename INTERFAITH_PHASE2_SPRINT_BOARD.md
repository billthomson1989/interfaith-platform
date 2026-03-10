# Interfaith Platform — Phase 2 Sprint Board

Last updated: 2026-03-10
Scope: convert remaining work into executable slices with clear order.

## Sprint structure
- **Sprint 2A:** Real citations + schema normalization
- **Sprint 2B:** Queue/session lifecycle (matching foundation)
- **Sprint 2C:** Auth/session hardening
- **Sprint 2D:** Moderation workflow + observability cleanup

---

## Sprint 2A — Real citation data (target: 2–3 days)

### Outcomes
- `/citation/search` returns real records (not mock array)
- Frontend renders stable citation labels from normalized fields

### Tasks
1. **Define citation schema**
   - Fields: `id`, `tradition`, `reference`, `canonical_key`, `text`, `translation`, `source`, `language`, `tags`
   - Output contract for API response finalized

2. **Add storage and seed path**
   - Option A: Postgres table + seed script
   - Option B: curated JSON dataset + loader (short-term)

3. **Replace mock handler**
   - Update `GET /citation/search` to query real data source
   - Add filtering for `q` and `tradition`

4. **Frontend field mapping update**
   - Render `reference` first
   - Fallback chain only as safety (`canonical_key`, then "Citation")

5. **Tests**
   - Add API test for citation query
   - Extend smoke test to assert non-placeholder citation metadata

### Files
- `apps/api/src/server.js`
- `apps/web/src/server.js`
- `apps/web/scripts/smoke-e2e.mjs`
- `infrastructure/env.example`
- new: `apps/api/src/data/citations.*` or DB migration + seed

### Exit criteria
- `GET /citation/search` no longer depends on in-memory `sampleCitations`
- UI no longer shows generic fallback labels in normal case

---

## Sprint 2B — Queue/session lifecycle (target: 3–4 days)

### Outcomes
- Queue transitions into actual matched sessions
- Session states tracked and queryable

### Tasks
1. **Session model design**
   - States: `queued`, `matched`, `active`, `ended`, `expired`
   - Session fields: participants, mode, created/matched/ended timestamps

2. **Matcher implementation**
   - Basic deterministic matcher (same language + compatible mode)
   - Queue timeout handling

3. **Endpoints**
   - Keep existing queue endpoints
   - Add `GET /session/status?userId=...`
   - Add `POST /session/end`

4. **Persistence**
   - In-memory first + Postgres path for sessions

5. **Tests**
   - API flow test: join two users -> matched -> active -> end

### Files
- `apps/api/src/server.js` (or split service modules)
- new: `apps/api/src/matcher/*`
- new: DB migration for sessions

### Exit criteria
- At least one end-to-end match flow works without manual intervention

---

## Sprint 2C — Auth/session hardening (target: 2–3 days)

### Outcomes
- Session/auth survives API restarts
- Basic abuse controls in place

### Tasks
1. **User/session persistence**
   - Store sessions in DB or durable store (not only Map)

2. **Cookie/session policy**
   - Environment-safe cookie flags for prod (`Secure`, `SameSite`, expiration)

3. **Rate limiting**
   - Apply on `/auth/login`, `/reports`, and queue writes

4. **Auth contract cleanup**
   - Normalize auth response fields and error payloads

5. **Tests**
   - Session restore and unauthenticated access tests

### Files
- `apps/api/src/server.js`
- `infrastructure/env.example`
- new: `apps/api/src/auth/*`

### Exit criteria
- Restart does not invalidate all active sessions unexpectedly
- Auth endpoints rate-limited and deterministic

---

## Sprint 2D — Moderation workflow + ops cleanup (target: 2–3 days)

### Outcomes
- Reports become triage-able workflow items
- Better production safety and diagnostics

### Tasks
1. **Moderation workflow states**
   - `new`, `triaged`, `actioned`, `resolved`

2. **Admin review endpoints**
   - List/filter by status
   - Update status with reviewer note

3. **Structured logging**
   - Request id, route, status, latency

4. **Operational hardening**
   - Tighten CORS to known origins
   - Expand health/readiness checks
   - Remove temporary DNS fallback once confirmed stable

5. **Tests + runbook**
   - Add moderation API checks
   - Add rollback/redeploy notes in docs

### Files
- `apps/api/src/server.js`
- `apps/web/src/server.js`
- `infrastructure/env.example`
- new docs: `docs/interfaith-ops-runbook.md`

### Exit criteria
- Moderation items track lifecycle state
- Production config no longer relies on temporary network fallback

---

## Cross-sprint guardrails
- Keep current endpoints backward compatible where possible.
- Ship in small merges; run smoke e2e before each deploy.
- Avoid large refactors and feature additions in same commit.
- Record each sprint outcome in `memory/YYYY-MM-DD.md` + update `MEMORY.md` for durable continuity.

---

## Immediate next action (start now)
1. Implement Sprint 2A task #1–#3 in a single PR:
   - schema + real citation storage + `/citation/search` replacement
2. Then patch frontend mapping and smoke assertions.
