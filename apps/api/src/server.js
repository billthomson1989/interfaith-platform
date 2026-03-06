import http from "node:http";
import crypto from "node:crypto";

const port = Number(process.env.API_PORT || 4000);

const queueByUser = new Map();

const sampleCitations = [
  {
    tradition: "islam",
    canonicalKey: "QURAN 2:256",
    text: "There is no compulsion in religion.",
    translation: "Sahih International"
  },
  {
    tradition: "christianity",
    canonicalKey: "MATTHEW 5:9",
    text: "Blessed are the peacemakers, for they shall be called children of God.",
    translation: "NIV"
  },
  {
    tradition: "judaism",
    canonicalKey: "PSALMS 34:14",
    text: "Turn from evil and do good; seek peace and pursue it.",
    translation: "JPS"
  }
];

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(payload));
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

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
    const body = await readBody(req);
    const userId = (body.userId || "demo-user").toString();

    const entry = {
      queueId: crypto.randomUUID(),
      userId,
      mode: body.modePreference || "voice_only",
      language: body.language || "en",
      intentTags: Array.isArray(body.intentTags) ? body.intentTags : [],
      queuedAt: new Date().toISOString()
    };

    queueByUser.set(userId, entry);

    return sendJson(res, 200, {
      ok: true,
      ...entry
    });
  }

  if (req.method === "GET" && url.pathname === "/queue/status") {
    const userId = (url.searchParams.get("userId") || "demo-user").toString();
    const entry = queueByUser.get(userId);

    if (!entry) {
      return sendJson(res, 200, { ok: true, queued: false, userId });
    }

    return sendJson(res, 200, {
      ok: true,
      queued: true,
      ...entry
    });
  }

  if (req.method === "POST" && url.pathname === "/queue/leave") {
    const body = await readBody(req);
    const userId = (body.userId || "demo-user").toString();
    const removed = queueByUser.delete(userId);

    return sendJson(res, 200, {
      ok: true,
      removed,
      userId
    });
  }

  if (req.method === "GET" && url.pathname === "/citation/search") {
    const q = (url.searchParams.get("q") || "").toLowerCase().trim();
    const tradition = (url.searchParams.get("tradition") || "").toLowerCase().trim();

    const results = sampleCitations.filter((item) => {
      const textMatch = !q || item.text.toLowerCase().includes(q) || item.canonicalKey.toLowerCase().includes(q);
      const traditionMatch = !tradition || item.tradition === tradition;
      return textMatch && traditionMatch;
    });

    return sendJson(res, 200, { ok: true, count: results.length, results });
  }

  return sendJson(res, 404, { ok: false, error: "Not found" });
});

server.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`);
});
