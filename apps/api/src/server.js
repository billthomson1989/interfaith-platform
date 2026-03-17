import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.API_PORT || 4000);
const usePostgres = process.env.USE_POSTGRES === "true";

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const citationsPath = path.join(__dirname, "data", "citations.json");

const queueByUser = new Map();
const moderationReports = [];
const authSessions = new Map();
const dialogueSessions = new Map();

let pgClient = null;

const normalizeCitation = (raw) => {
  if (!raw || typeof raw !== "object") return null;

  const reference = (raw.reference || "").toString().trim();
  const canonicalKey = (raw.canonical_key || raw.canonicalKey || "").toString().trim();
  const text = (raw.text || "").toString().trim();

  if (!reference || !canonicalKey || !text) return null;

  return {
    id: (raw.id || crypto.randomUUID()).toString(),
    tradition: (raw.tradition || "unknown").toString().toLowerCase(),
    reference,
    canonical_key: canonicalKey,
    text,
    translation: (raw.translation || "Unknown").toString(),
    source: (raw.source || "Unknown").toString(),
    language: (raw.language || "en").toString().toLowerCase(),
    tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => String(tag).toLowerCase()) : []
  };
};

const loadCitations = () => {
  try {
    const raw = fs.readFileSync(citationsPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("citations.json must be an array");

    const normalized = parsed.map(normalizeCitation).filter(Boolean);
    if (!normalized.length) throw new Error("No valid citations found after normalization");

    console.log(`[api] loaded ${normalized.length} citations from ${citationsPath}`);
    return normalized;
  } catch (error) {
    console.warn("[api] citation load failed, falling back to empty set:", error.message);
    return [];
  }
};

const citations = loadCitations();

const rankCitation = (item, q) => {
  if (!q) return 1;
  const query = q.toLowerCase();
  const fields = {
    reference: (item.reference || "").toLowerCase(),
    canonical: (item.canonical_key || "").toLowerCase(),
    text: (item.text || "").toLowerCase(),
    translation: (item.translation || "").toLowerCase(),
    source: (item.source || "").toLowerCase(),
    tradition: (item.tradition || "").toLowerCase(),
    tags: (item.tags || []).join(" ").toLowerCase()
  };

  let score = 0;
  if (fields.reference.includes(query)) score += 8;
  if (fields.canonical.includes(query)) score += 7;
  if (fields.text.includes(query)) score += 4;
  if (fields.tags.includes(query)) score += 3;
  if (fields.translation.includes(query)) score += 2;
  if (fields.source.includes(query)) score += 2;
  if (fields.tradition.includes(query)) score += 1;
  return score;
};

const searchCitationsInMemory = ({ q, tradition, language, limit }) => {
  const normalizedQ = (q || "").toLowerCase().trim();
  const normalizedTradition = (tradition || "").toLowerCase().trim();
  const normalizedLanguage = (language || "").toLowerCase().trim();

  return citations
    .map((item) => ({ item, score: rankCitation(item, normalizedQ) }))
    .filter(({ item, score }) => {
      const textMatch = !normalizedQ || score > 0;
      const traditionMatch = !normalizedTradition || item.tradition === normalizedTradition;
      const languageMatch = !normalizedLanguage || item.language === normalizedLanguage;
      return textMatch && traditionMatch && languageMatch;
    })
    .sort((a, b) => b.score - a.score || a.item.reference.localeCompare(b.item.reference))
    .slice(0, limit)
    .map(({ item }) => ({ ...item, canonicalKey: item.canonical_key }));
};

const canMatch = (a, b) => a.language === b.language && a.mode === b.mode;

const tryMatchForUser = (newEntry) => {
  for (const candidate of queueByUser.values()) {
    if (candidate.userId === newEntry.userId) continue;
    if (!canMatch(newEntry, candidate)) continue;

    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const participants = [newEntry.userId, candidate.userId].sort();

    const session = {
      sessionId,
      state: "active",
      mode: newEntry.mode,
      language: newEntry.language,
      participants,
      matchedAt: now,
      startedAt: now,
      endedAt: null,
      endedReason: null
    };

    dialogueSessions.set(sessionId, session);
    queueByUser.delete(newEntry.userId);
    queueByUser.delete(candidate.userId);
    return session;
  }

  return null;
};

const findSessionByUser = (userId) => {
  for (const session of dialogueSessions.values()) {
    if (session.participants.includes(userId) && session.state !== "ended") {
      return session;
    }
  }
  return null;
};

const initPostgresIfEnabled = async () => {
  if (!usePostgres) return;

  try {
    const { Client } = await import("pg");
    pgClient = new Client({
      connectionString: process.env.DATABASE_URL || "postgresql://interfaith:interfaith@localhost:5432/interfaith"
    });
    await pgClient.connect();
    await pgClient.query(`
      create table if not exists queue_entries (
        user_id text primary key,
        queue_id text not null,
        mode text not null,
        language text not null,
        intent_tags jsonb not null,
        queued_at timestamptz not null default now()
      )
    `);
    await pgClient.query(`
      create table if not exists moderation_reports (
        id text primary key,
        session_id text,
        reporter_user_id text not null,
        target_user_id text,
        category text not null,
        notes text,
        created_at timestamptz not null default now()
      )
    `);
    await pgClient.query(`
      create table if not exists dialogue_sessions (
        session_id text primary key,
        state text not null,
        mode text not null,
        language text not null,
        participants jsonb not null,
        matched_at timestamptz not null,
        started_at timestamptz,
        ended_at timestamptz,
        ended_reason text
      )
    `);
    await pgClient.query(`
      create table if not exists citations (
        id text primary key,
        tradition text not null,
        reference text not null,
        canonical_key text not null,
        text text not null,
        translation text not null,
        source text not null,
        language text not null,
        tags jsonb not null default '[]'::jsonb,
        updated_at timestamptz not null default now()
      )
    `);

    const { rows } = await pgClient.query(`select count(*)::int as count from citations`);
    if ((rows?.[0]?.count || 0) === 0 && citations.length) {
      for (const c of citations) {
        await pgClient.query(
          `insert into citations(id, tradition, reference, canonical_key, text, translation, source, language, tags)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict(id) do update set
             tradition = excluded.tradition,
             reference = excluded.reference,
             canonical_key = excluded.canonical_key,
             text = excluded.text,
             translation = excluded.translation,
             source = excluded.source,
             language = excluded.language,
             tags = excluded.tags,
             updated_at = now()`,
          [c.id, c.tradition, c.reference, c.canonical_key, c.text, c.translation, c.source, c.language, JSON.stringify(c.tags || [])]
        );
      }
      console.log(`[api] seeded ${citations.length} citations into postgres`);
    }

    console.log("[api] postgres connected");
  } catch (error) {
    console.warn("[api] postgres init failed; falling back to in-memory", error.message);
    pgClient = null;
  }
};

const resolveCorsOrigin = (req) => {
  const origin = req.headers.origin;
  if (!origin) return allowedOrigins[0] || "http://localhost:3000";
  if (allowedOrigins.includes(origin)) return origin;
  return null;
};

const sendJson = (req, res, statusCode, payload, extraHeaders = {}) => {
  const corsOrigin = resolveCorsOrigin(req);

  const baseHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (corsOrigin) {
    baseHeaders["Access-Control-Allow-Origin"] = corsOrigin;
  }

  res.writeHead(statusCode, {
    ...baseHeaders,
    ...extraHeaders
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

const parseCookies = (req) => {
  const raw = req.headers.cookie || "";
  return Object.fromEntries(
    raw
      .split(";")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((pair) => {
        const idx = pair.indexOf("=");
        if (idx === -1) return [pair, ""];
        return [pair.slice(0, idx), decodeURIComponent(pair.slice(idx + 1))];
      })
  );
};

const searchCitationsPostgres = async ({ q, tradition, language, limit }) => {
  if (!pgClient) return null;

  const normalizedQ = (q || "").trim();
  const normalizedTradition = (tradition || "").toLowerCase().trim();
  const normalizedLanguage = (language || "").toLowerCase().trim();

  const where = [];
  const values = [];

  if (normalizedQ) {
    values.push(`%${normalizedQ}%`);
    const idx = values.length;
    where.push(`(
      reference ilike $${idx}
      or canonical_key ilike $${idx}
      or text ilike $${idx}
      or translation ilike $${idx}
      or source ilike $${idx}
      or tradition ilike $${idx}
      or exists (select 1 from jsonb_array_elements_text(tags) t(tag) where tag ilike $${idx})
    )`);
  }

  if (normalizedTradition) {
    values.push(normalizedTradition);
    where.push(`tradition = $${values.length}`);
  }

  if (normalizedLanguage) {
    values.push(normalizedLanguage);
    where.push(`language = $${values.length}`);
  }

  values.push(limit);
  const limitIdx = values.length;

  const sql = `
    select id, tradition, reference, canonical_key, text, translation, source, language, tags
    from citations
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by reference asc
    limit $${limitIdx}
  `;

  const { rows } = await pgClient.query(sql, values);
  return rows.map((item) => ({ ...item, canonicalKey: item.canonical_key }));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    return sendJson(req, res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(req, res, 200, {
      ok: true,
      service: "interfaith-api",
      persistence: pgClient ? "postgres" : "memory",
      citationSource: pgClient ? "postgres" : citations.length ? "dataset" : "empty",
      activeSessions: [...dialogueSessions.values()].filter((s) => s.state !== "ended").length,
      queueDepth: queueByUser.size,
      timestamp: new Date().toISOString()
    });
  }

  if (req.method === "POST" && url.pathname === "/auth/signup") {
    return sendJson(req, res, 200, {
      ok: true,
      next: "verify-email",
      message: "Signup stub ready"
    });
  }

  if (req.method === "POST" && url.pathname === "/auth/login") {
    const body = await readBody(req);
    const userId = (body.userId || "demo-user").toString();
    const token = crypto.randomUUID();
    authSessions.set(token, { userId, createdAt: new Date().toISOString() });

    return sendJson(
      req,
      res,
      200,
      { ok: true, userId, sessionToken: token },
      { "Set-Cookie": `interfaith_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400` }
    );
  }

  if (req.method === "GET" && url.pathname === "/me") {
    const cookies = parseCookies(req);
    const token = cookies.interfaith_session;
    const session = token ? authSessions.get(token) : null;

    if (!session) {
      return sendJson(req, res, 401, { ok: false, error: "Not authenticated" });
    }

    return sendJson(req, res, 200, { ok: true, userId: session.userId, sessionCreatedAt: session.createdAt });
  }

  if (req.method === "POST" && url.pathname === "/queue/join") {
    const body = await readBody(req);
    const userId = (body.userId || "demo-user").toString();

    const existingSession = findSessionByUser(userId);
    if (existingSession) {
      return sendJson(req, res, 200, { ok: true, alreadyMatched: true, session: existingSession });
    }

    const entry = {
      queueId: crypto.randomUUID(),
      userId,
      mode: body.modePreference || "voice_only",
      language: body.language || "en",
      intentTags: Array.isArray(body.intentTags) ? body.intentTags : [],
      queuedAt: new Date().toISOString()
    };

    queueByUser.set(userId, entry);

    if (pgClient) {
      await pgClient.query(
        `insert into queue_entries(user_id, queue_id, mode, language, intent_tags, queued_at)
         values($1,$2,$3,$4,$5,$6)
         on conflict(user_id) do update set queue_id=excluded.queue_id, mode=excluded.mode, language=excluded.language, intent_tags=excluded.intent_tags, queued_at=excluded.queued_at`,
        [entry.userId, entry.queueId, entry.mode, entry.language, JSON.stringify(entry.intentTags), entry.queuedAt]
      );
    }

    const matchedSession = tryMatchForUser(entry);
    if (matchedSession) {
      if (pgClient) {
        await pgClient.query(
          `insert into dialogue_sessions(session_id, state, mode, language, participants, matched_at, started_at)
           values($1,$2,$3,$4,$5,$6,$7)`,
          [
            matchedSession.sessionId,
            matchedSession.state,
            matchedSession.mode,
            matchedSession.language,
            JSON.stringify(matchedSession.participants),
            matchedSession.matchedAt,
            matchedSession.startedAt
          ]
        );
        await pgClient.query(`delete from queue_entries where user_id = any($1)`, [matchedSession.participants]);
      }

      return sendJson(req, res, 200, {
        ok: true,
        matched: true,
        queued: false,
        session: matchedSession
      });
    }

    return sendJson(req, res, 200, { ok: true, matched: false, queued: true, ...entry });
  }

  if (req.method === "GET" && url.pathname === "/queue/status") {
    const userId = (url.searchParams.get("userId") || "demo-user").toString();
    const activeSession = findSessionByUser(userId);

    if (activeSession) {
      return sendJson(req, res, 200, {
        ok: true,
        queued: false,
        matched: true,
        session: activeSession
      });
    }

    const entry = queueByUser.get(userId);
    if (!entry) {
      return sendJson(req, res, 200, { ok: true, queued: false, matched: false, userId });
    }

    return sendJson(req, res, 200, { ok: true, queued: true, matched: false, ...entry });
  }

  if (req.method === "POST" && url.pathname === "/queue/leave") {
    const body = await readBody(req);
    const userId = (body.userId || "demo-user").toString();
    const removed = queueByUser.delete(userId);

    if (pgClient) {
      await pgClient.query(`delete from queue_entries where user_id = $1`, [userId]);
    }

    return sendJson(req, res, 200, { ok: true, removed, userId });
  }

  if (req.method === "GET" && url.pathname === "/session/status") {
    const userId = (url.searchParams.get("userId") || "demo-user").toString();

    const session = findSessionByUser(userId);
    if (!session) {
      return sendJson(req, res, 200, { ok: true, active: false, userId });
    }

    return sendJson(req, res, 200, {
      ok: true,
      active: true,
      session,
      partnerUserId: session.participants.find((id) => id !== userId) || null
    });
  }

  if (req.method === "POST" && url.pathname === "/session/end") {
    const body = await readBody(req);
    const userId = (body.userId || "demo-user").toString();
    const reason = (body.reason || "user_ended").toString();
    const session = findSessionByUser(userId);

    if (!session) {
      return sendJson(req, res, 404, { ok: false, error: "No active session for user" });
    }

    session.state = "ended";
    session.endedAt = new Date().toISOString();
    session.endedReason = reason;

    if (pgClient) {
      await pgClient.query(
        `update dialogue_sessions set state = $2, ended_at = $3, ended_reason = $4 where session_id = $1`,
        [session.sessionId, session.state, session.endedAt, session.endedReason]
      );
    }

    return sendJson(req, res, 200, { ok: true, ended: true, session });
  }

  if (req.method === "GET" && url.pathname === "/citation/search") {
    const q = (url.searchParams.get("q") || "").trim();
    const tradition = (url.searchParams.get("tradition") || url.searchParams.get("trad") || "").trim();
    const language = (url.searchParams.get("language") || "").trim();
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 25)));

    const pgResults = await searchCitationsPostgres({ q, tradition, language, limit });
    const results = pgResults || searchCitationsInMemory({ q, tradition, language, limit });

    return sendJson(req, res, 200, {
      ok: true,
      count: results.length,
      q,
      tradition: tradition || null,
      language: language || null,
      source: pgResults ? "postgres" : "json",
      results
    });
  }

  if (req.method === "POST" && url.pathname === "/reports") {
    const body = await readBody(req);
    const report = {
      id: crypto.randomUUID(),
      sessionId: body.sessionId || null,
      reporterUserId: (body.reporterUserId || "demo-user").toString(),
      targetUserId: body.targetUserId || null,
      category: body.category || "other",
      notes: body.notes || "",
      createdAt: new Date().toISOString()
    };

    moderationReports.push(report);

    if (pgClient) {
      await pgClient.query(
        `insert into moderation_reports(id, session_id, reporter_user_id, target_user_id, category, notes, created_at)
         values($1,$2,$3,$4,$5,$6,$7)`,
        [report.id, report.sessionId, report.reporterUserId, report.targetUserId, report.category, report.notes, report.createdAt]
      );
    }

    return sendJson(req, res, 201, { ok: true, report });
  }

  if (req.method === "GET" && url.pathname === "/reports") {
    return sendJson(req, res, 200, {
      ok: true,
      count: moderationReports.length,
      reports: moderationReports.slice(-50)
    });
  }

  return sendJson(req, res, 404, { ok: false, error: "Not found" });
});

initPostgresIfEnabled().finally(() => {
  server.listen(port, () => {
    console.log(`[api] listening on http://localhost:${port}`);
  });
});
