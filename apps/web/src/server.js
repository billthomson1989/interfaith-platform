import http from "node:http";

const port = Number(process.env.APP_PORT || 3000);
const apiUrl = process.env.API_BASE_URL || "http://localhost:4000";

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Interfaith Platform</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; max-width: 760px; }
      .card { border: 1px solid #ddd; border-radius: 10px; padding: 1rem; margin-top: 1rem; }
      code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>Interfaith Platform — Web Shell</h1>
    <p>MVP scaffolding is live.</p>
    <div class="card">
      <h3>Queue Placeholder</h3>
      <p>Next: realtime matching + voice session handshake.</p>
    </div>
    <div class="card">
      <h3>Citation Placeholder</h3>
      <p>Next: scripture search and citation cards.</p>
    </div>
    <p>API target: <code>${apiUrl}</code></p>
  </body>
</html>`;

http.createServer((req, res) => {
  if ((req.url || "/") === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, service: "interfaith-web", timestamp: new Date().toISOString() }));
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(port, () => {
  console.log(`[web] listening on http://localhost:${port}`);
});
