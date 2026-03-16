# x15.x10hosting preflight (do this before File Manager upload)

## 1) Backend readiness (must-pass)

- [ ] Backend runs with Postgres (not memory fallback)
- [ ] `USE_POSTGRES=true`
- [ ] `DATABASE_URL` points to reachable DB
- [ ] `/health` shows `"persistence":"postgres"`
- [ ] `CORS_ORIGINS` contains only production frontend origin(s)

Example production API env:

```env
NODE_ENV=production
API_PORT=4000
USE_POSTGRES=true
DATABASE_URL=postgresql://<user>:<pass>@<host>:5432/<db>
CORS_ORIGINS=https://interfaith.billthomson.elementfx.com
```

## 2) Frontend deployment package sanity

Folder to upload:

- `deploy/interfaith-live/`

Required files:

- `index.html`
- `assets/css/app.css`
- `assets/js/app.js`
- `assets/js/config.js`  ← environment endpoint config

## 3) Update runtime API endpoint in File Manager

On x10 path:

`/domains/interfaith.billthomson.elementfx.com/assets/js/config.js`

Set:

```js
globalThis.__INTERFAITH_RUNTIME__ = {
  apiBase: "https://api.interfaith.billthomson.elementfx.com/api",
  apiFallback: ""
};
```

## 4) Live verification (after upload)

- [ ] Open `https://interfaith.billthomson.elementfx.com`
- [ ] Browser devtools shows `config.js` loaded (no 404)
- [ ] Login works
- [ ] Queue join/status works
- [ ] Citation search returns results
- [ ] No CORS errors in console/network

## 5) Rollback plan

- Keep previous `interfaith-live` copy as `interfaith-live-prev`
- If errors appear, restore previous `index.html` + `assets/js/*`

---

## Notes

- `app.js` now reads endpoint values from `assets/js/config.js`.
- This lets you switch API hosts directly in x10 File Manager without rebuilding code.
