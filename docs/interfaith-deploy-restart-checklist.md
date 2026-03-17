# Interfaith Platform — Deploy/Restart Checklist

Last updated: 2026-03-17
Scope: deploy citation-search Phase 2.1 updates safely to live.

## Release contents

- `9328e77` — citation search backend (postgres + ranking/filters)
- `7b986fa` — citation seed script + automated citation API tests

---

## 1) Pre-deploy checks (local)

- [ ] Confirm intended commits are present in branch history
- [ ] Confirm working tree is clean (or only expected uncommitted files)
- [ ] Run API citation tests:

```bash
npm --workspace @interfaith/api run test:citations
```

- [ ] Run full smoke E2E:

```bash
npm --workspace @interfaith/web run smoke:e2e
```

---

## 2) Production config/data readiness

- [ ] API environment has expected values:
  - [ ] `USE_POSTGRES=true` (for DB-backed citation search)
  - [ ] `DATABASE_URL` set and reachable
  - [ ] `CORS_ORIGINS` includes frontend origin(s)
- [ ] Frontend/API routing points to primary API domain:
  - [ ] `https://api.interfaith.billthomson.elementfx.com/api`
- [ ] If this is first DB-backed citation deploy, seed citations:

```bash
npm --workspace @interfaith/api run seed:citations
```

---

## 3) Deploy steps

- [ ] Pull latest code on target host
- [ ] Install dependencies if needed:

```bash
npm install
```

- [ ] Restart API service
- [ ] Restart web service (if deployed from same release unit)
- [ ] Confirm process manager shows healthy services (PM2/systemd/Docker)

---

## 4) Post-restart validation (live)

### API checks

- [ ] Health endpoint:

```bash
curl -s https://api.interfaith.billthomson.elementfx.com/api/health
```

Expect:
- `ok: true`
- `citationSource` is expected (`postgres` preferred, `dataset` acceptable fallback)

- [ ] Citation query check:

```bash
curl -s "https://api.interfaith.billthomson.elementfx.com/api/citation/search?q=peace&tradition=christianity&limit=3"
```

Expect:
- `ok: true`
- `count >= 1`
- records include stable metadata (`reference`, `canonical_key`, `translation`, `tradition`, `source`)

### UI checks

- [ ] Open frontend in normal mode:
  - [ ] `https://interfaith.billthomson.elementfx.com/?v=fix2`
- [ ] Login + Who am I works
- [ ] Queue join/status works
- [ ] Citation search returns real results (not placeholder/fallback labels)

### Optional fallback check

- [ ] Verify explicit fallback mode still works:
  - [ ] `https://interfaith.billthomson.elementfx.com/?v=fix2&fallback=1`

---

## 5) Rollback plan

- [ ] Keep prior stable release/commit ready before deploy
- [ ] On major regression:
  1. roll back to previous release
  2. restart services
  3. re-validate `/health`, login, queue, citation search
- [ ] On DB-specific issues only:
  - temporarily disable postgres citation path and run JSON-backed fallback while debugging connectivity/migrations

---

## 6) Known-good operational commands

```bash
# API citation tests (local/staging)
npm --workspace @interfaith/api run test:citations

# Seed citations into postgres
npm --workspace @interfaith/api run seed:citations

# Full browser smoke
npm --workspace @interfaith/web run smoke:e2e
```

---

## 7) Sign-off

- [ ] Tests passed pre-deploy
- [ ] Deploy + restart completed
- [ ] Live health checks passed
- [ ] Live UI checks passed
- [ ] Rollback artifacts preserved
