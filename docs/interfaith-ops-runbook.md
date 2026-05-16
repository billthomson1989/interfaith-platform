# Interfaith Platform — Ops Runbook

Last updated: 2026-04-11

This runbook captures the practical steps to operate the Interfaith platform in production.

---

## 1. Components

- **API (VPS)**
  - Node service: `interfaith-api` (systemd unit)
  - Code path on server: `/opt/interfaith-api/`
  - HTTP base: `http://127.0.0.1:8787/api`
- **Frontend (x10hosting)**
  - Static files under: `/domains/interfaith.billthomson.elementfx.com/public_html`
  - Deployed folder: `deploy/interfaith-live/` (mirrored into x10)
- **Database (Postgres)**
  - Reachable from API host via `DATABASE_URL`
  - Used by the newer `apps/api/src/server.js` stack; the VPS shim reports `persistence` but does not manage migrations itself.

---

## 2. Health and readiness checks

### From the VPS (API)

- **Health:**

```bash
curl -s http://127.0.0.1:8787/api/health | jq
```

Expect:

- `ok: true`
- `activeSessions` reflects live sessions
- `queueDepth` and `queue.depth` non-negative
- `queue.ttlMs` matches configured TTL (default 300000)

- **Readiness:**

```bash
curl -s -i http://127.0.0.1:8787/api/ready
```

Expect:

- HTTP `200`
- `ok: true`

- **Version:**

```bash
curl -s http://127.0.0.1:8787/api/version | jq
```

Expect:

- `ok: true`
- `version.commitSha` and `version.startedAt` present.

### From the public internet

Use the public API domain (once DNS / proxying is configured):

```bash
curl -s "https://api.interfaith.billthomson.elementfx.com/api/health" | jq
curl -s "https://api.interfaith.billthomson.elementfx.com/api/ready" | jq
curl -s "https://api.interfaith.billthomson.elementfx.com/api/version" | jq
```

---

## 3. Routine operations

### Restart API service

On the VPS:

```bash
sudo systemctl restart interfaith-api
sudo systemctl status interfaith-api
```

If status is not `active (running)`, check logs (see below).

### View API logs

The VPS shim logs to stdout/stderr via systemd:

```bash
journalctl -u interfaith-api -n 200 -f
```

Look for structured JSON log entries with `requestId`, `method`, `path`, `status`, and `durationMs`.

### Check queue/sessions quickly

After restart:

```bash
curl -s http://127.0.0.1:8787/api/health | jq '{ok, activeSessions, queueDepth: .queueDepth, queue: .queue}'
```

---

## 4. Deploying API updates (VPS)

From your local repo (on the VPS host or via ssh):

```bash
cd /path/to/your/interfaith-repo
./deploy/vps/deploy-interfaith-api.sh
```

What this script does:

1. Copies `deploy/vps/interfaith-api/server.js` and `package.json` into `/opt/interfaith-api/`.
2. Writes `.build-meta.json` with `commitSha` and `buildTime`.
3. Runs `npm install --omit=dev` in `/opt/interfaith-api/`.
4. Restarts `interfaith-api` via systemd.
5. Hits `http://127.0.0.1:8787/api/health` to confirm the process is responding.

If any step fails, fix the issue and re-run the script.

---

## 5. Deploying frontend updates (x10hosting)

1. **Preflight:** follow `deploy/X10_PREP_CHECKLIST.md` locally:
   - Ensure backend is healthy and using the correct CORS/host config.
   - Prepare `deploy/interfaith-live/` locally.
2. **Upload:**
   - In x10 File Manager (or via FTP), upload the contents of `deploy/interfaith-live/` into the site root:
     - `index.html`
     - `assets/css/app.css`
     - `assets/js/app.js`
     - `assets/js/config.js`
3. **Configure runtime endpoint:**
   - Edit `/domains/interfaith.billthomson.elementfx.com/assets/js/config.js` on x10 to point to the live API:

     ```js
     globalThis.__INTERFAITH_RUNTIME__ = {
       apiBase: "https://api.interfaith.billthomson.elementfx.com/api",
       apiFallback: ""
     };
     ```

4. **Smoke check in browser:**
   - Load `https://interfaith.billthomson.elementfx.com`.
   - Open DevTools, confirm `config.js` loads and no CORS errors appear.
   - Verify login, queue join/status, citation search, and moderation admin flows.

---

## 6. Rollback procedures

### API rollback

- Keep the previous `/opt/interfaith-api/` contents (or at least prior `server.js` + `package.json`) under a backup directory.
- To roll back:

```bash
sudo systemctl stop interfaith-api
# restore previous server.js + package.json into /opt/interfaith-api
sudo systemctl start interfaith-api
sudo systemctl status interfaith-api
curl -s http://127.0.0.1:8787/api/health | jq
```

If health fails, inspect logs and decide whether to roll back further.

### Frontend rollback

- Keep the previous `interfaith-live` folder on x10 as `interfaith-live-prev`.
- To roll back:
  1. Replace `index.html` and `assets/js/app.js` with the versions from `interfaith-live-prev`.
  2. Hard-refresh the site (or append a new `?v=` cache-buster).

---

## 7. Config & safety notes

- **CORS:**
  - In production, set `CORS_ORIGINS` on the API host to your real frontend origin(s) only, e.g.:

    ```env
    CORS_ORIGINS=https://interfaith.billthomson.elementfx.com
    ```

- **Queue TTL:**
  - `QUEUE_TTL_MS` controls how long queue entries live before being expired.
  - Default: 5 minutes (300000 ms). Set an explicit value in the API env if you need a different window.
- **Admin auth:**
  - Admin endpoints require a session cookie whose `userId` is in `ADMIN_USER_IDS` (e.g. `demo-admin,ops`).

This file should stay short and practical. If you change how deploy or hosting works, update this runbook alongside the code.
