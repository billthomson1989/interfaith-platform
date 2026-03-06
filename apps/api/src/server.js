import http from "node:http";
import crypto from "node:crypto";

const port = Number(process.env.API_PORT || 4000);

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "interfaith-api",
      timestamp: new Date().toISOString()
    });
  }

  if (req.method === "POST" && url.pathname === "/auth/signup") {
    return sendJson(res, 200, {
      ok: true,
      next: "verify-email",
      message: "Signup stub ready"
    });
  }

  if (req.method === "POST" && url.pathname === "/queue/join") {
    return sendJson(res, 200, {
      ok: true,
      queueId: crypto.randomUUID(),
      queuedAt: new Date().toISOString(),
      mode: "voice_only"
    });
  }

  return sendJson(res, 404, { ok: false, error: "Not found" });
});

server.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`);
});
