import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.API_PORT || 4000);
const usePostgres = process.env.USE_POSTGRES === "true";
const commitSha = process.env.COMMIT_SHA || process.env.GIT_COMMIT || "dev";
const buildTime = process.env.BUILD_TIME || null;
const startedAt = new Date().toISOString();

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
const rateLimitStore = new Map();

const isProd = (process.env.NODE_ENV || "development") === "production";
const adminUserIds = new Set(
  (process.env.ADMIN_USER_IDS || "demo-admin,ops")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

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

const modeCompatibility = new Set(["voice_only", "voice_then_video"]);

const resolveMatchedMode = (a, b) => {
  const values = [a, b].map((v) => (v || "").toString());
  if (values[0] === values[1]) return values[0];
  if (values.every((v) => modeCompatibility.has(v))) return "voice_then_video";
  return null;
};

const canMatch = (a, b) => {
  const sameLanguage = (a.language || "").toLowerCase() === (b.language || "").toLowerCase();
  const matchedMode = resolveMatchedMode(a.mode, b.mode);
  return sameLanguage && Boolean(matchedMode);
};

const tryMatchForUser = (newEntry) => {
  const compatibleCandidates = [...queueByUser.values()]
    .filter((candidate) => candidate.userId !== newEntry.userId)
    .filter((candidate) => canMatch(newEntry, candidate))
    .sort((a, b) => new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime());

  const candidate = compatibleCandidates[0];
  if (!candidate) return null;

  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const participants = [newEntry.userId, candidate.userId].sort();

  const session = {
    sessionId,
    state: "active",
    mode: resolveMatchedMode(newEntry.mode, candidate.mode) || newEntry.mode,
    language: (newEntry.language || "en").toLowerCase(),
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
};

const findSessionByUser = (userId) => {
  for (const session of dialogueSessions.values()) {
    if (session.participants.includes(userId) && session.state !== "ended") {
      return session;
    }
  }
  return null;
};

const hydrateRuntimeFromPostgres = async () => {
  if (!pgClient) return;

  const queueRows = await pgClient.query(`select user_id, queue_id, mode, language, intent_tags, queued_at from queue_entries`);
  for (const row of queueRows.rows) {
    queueByUser.set(row.user_id, {
      queueId: row.queue_id,
      userId: row.user_id,
      mode: row.mode,
      language: row.language,
      intentTags: Array.isArray(row.intent_tags) ? row.intent_tags : [],
      queuedAt: new Date(row.queued_at).toISOString()
    });
  }

  const sessionRows = await pgClient.query(`
    select session_id, state, mode, language, participants, matched_at, started_at, ended_at, ended_reason
    from dialogue_sessions
  `);
  for (const row of sessionRows.rows) {
    dialogueSessions.set(row.session_id, {
      sessionId: row.session_id,
      state: row.state,
      mode: row.mode,
      language: row.language,
      participants: Array.isArray(row.participants) ? row.participants : [],
      matchedAt: row.matched_at ? new Date(row.matched_at).toISOString() : null,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : null,
      endedReason: row.ended_reason || null
    });
  }

  console.log(`[api] hydrated runtime state from postgres: queue=${queueByUser.size}, sessions=${dialogueSessions.size}`);
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
        status text not null default 'new',
        reviewer_note text,
        reviewed_by text,
        reviewed_at timestamptz,
        created_at timestamptz not null default now()
      )
    `);
    await pgClient.query(`alter table moderation_reports add column if not exists status text not null default 'new'`);
    await pgClient.query(`alter table moderation_reports add column if not exists reviewer_note text`);
    await pgClient.query(`alter table moderation_reports add column if not exists reviewed_by text`);
    await pgClient.query(`alter table moderation_reports add column if not exists reviewed_at timestamptz`);
    await pgClient.query(`
      create table if not exists report_events (
        id text primary key,
        report_id text not null,
        event_type text not null,
        actor_user_id text,
        from_status text,
        to_status text,
        note text,
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
    await pgClient.query(`
      create table if not exists auth_sessions (
        token text primary key,
        user_id text not null,
        created_at timestamptz not null default now()
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

    await hydrateRuntimeFromPostgres();
    console.log("[api] postgres connected");
  } catch (error) {
    console.warn("[api] postgres init failed; falling back to in-memory", error.message);
    pgClient = null;
  }
};

const validateCorsOrigins = () => {
  if (!allowedOrigins.length) {
    console.warn("[api] CORS allowlist is empty; only same-origin requests may work");
    return;
  }

  const invalid = allowedOrigins.filter((origin) => {
    if (origin === "*") return true;
    try {
      const u = new URL(origin);
      return !u.protocol.startsWith("http");
    } catch {
      return true;
    }
  });

  if (invalid.length) {
    console.warn(`[api] CORS allowlist has invalid entries: ${invalid.join(", ")}`);
  }

  console.log(`[api] CORS allowlist: ${allowedOrigins.join(", ")}`);
};

const resolveCorsOrigin = (req) => {
  const origin = req.headers.origin;
  if (!origin) return allowedOrigins[0] || "http://localhost:3000";
  if (allowedOrigins.includes(origin)) return origin;
  return null;
};

const logRequest = (req, statusCode, payload) => {
  const meta = req._requestMeta || { id: "unknown", startedAt: Date.now() };
  const durationMs = Date.now() - meta.startedAt;
  const ip = getClientIp(req);
  const pathOnly = req._pathname || new URL(req.url || "/", `http://${req.headers.host}`).pathname;

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      requestId: meta.id,
      method: req.method,
      path: pathOnly,
      status: statusCode,
      durationMs,
      ip,
      userId: req._authUserId || null,
      ok: typeof payload?.ok === "boolean" ? payload.ok : undefined
    })
  );
};

const sendJson = (req, res, statusCode, payload, extraHeaders = {}) => {
  const corsOrigin = resolveCorsOrigin(req);
  const requestId = req._requestMeta?.id || crypto.randomUUID();

  const baseHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "X-Request-Id": requestId
  };

  if (corsOrigin) {
    baseHeaders["Access-Control-Allow-Origin"] = corsOrigin;
  }

  res.writeHead(statusCode, {
    ...baseHeaders,
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
  logRequest(req, statusCode, payload);
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

const getClientIp = (req) => {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
};

const checkRateLimit = ({ key, limit, windowMs }) => {
  const now = Date.now();
  const bucket = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  rateLimitStore.set(key, bucket);

  if (bucket.count > limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  return { allowed: true, remaining: Math.max(0, limit - bucket.count) };
};

const cookieSessionValue = (token) => {
  const parts = [
    `interfaith_session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=86400"
  ];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
};

const storeAuthSession = async ({ token, userId, createdAt }) => {
  authSessions.set(token, { userId, createdAt });
  if (!pgClient) return;

  await pgClient.query(
    `insert into auth_sessions(token, user_id, created_at)
     values($1,$2,$3)
     on conflict(token) do update set user_id = excluded.user_id, created_at = excluded.created_at`,
    [token, userId, createdAt]
  );
};

const getAuthSession = async (token) => {
  if (!token) return null;

  const local = authSessions.get(token);
  if (local) return local;
  if (!pgClient) return null;

  const { rows } = await pgClient.query(`select user_id, created_at from auth_sessions where token = $1`, [token]);
  if (!rows.length) return null;

  const session = { userId: rows[0].user_id, createdAt: new Date(rows[0].created_at).toISOString() };
  authSessions.set(token, session);
  return session;
};

const requireAdminSession = async (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies.interfaith_session;
  const session = await getAuthSession(token);

  if (!session) {
    sendJson(req, res, 401, { ok: false, error: "Admin auth required" });
    return null;
  }

  if (!adminUserIds.has(session.userId)) {
    req._authUserId = session.userId;
    sendJson(req, res, 403, { ok: false, error: "Admin role required", userId: session.userId });
    return null;
  }

  req._authUserId = session.userId;
  return session;
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

const listReports = async ({ status }) => {
  const validStates = new Set(["new", "triaged", "actioned", "resolved"]);
  const normalizedStatus = (status || "").toLowerCase().trim();

  if (pgClient) {
    const values = [];
    let where = "";
    if (normalizedStatus && validStates.has(normalizedStatus)) {
      values.push(normalizedStatus);
      where = `where status = $1`;
    }

    const { rows } = await pgClient.query(
      `select id, session_id, reporter_user_id, target_user_id, category, notes, status, reviewer_note, reviewed_by, reviewed_at, created_at
       from moderation_reports
       ${where}
       order by created_at desc
       limit 50`,
      values
    );

    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      reporterUserId: r.reporter_user_id,
      targetUserId: r.target_user_id,
      category: r.category,
      notes: r.notes,
      status: r.status,
      reviewerNote: r.reviewer_note,
      reviewedBy: r.reviewed_by,
      reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null
    }));
  }

  return (!normalizedStatus || !validStates.has(normalizedStatus)
    ? moderationReports
    : moderationReports.filter((r) => (r.status || "new") === normalizedStatus)
  ).slice(-50);
};

const getReportById = async (reportId) => {
  if (pgClient) {
    const { rows } = await pgClient.query(
      `select id, session_id, reporter_user_id, target_user_id, category, notes, status, reviewer_note, reviewed_by, reviewed_at, created_at
       from moderation_reports where id = $1 limit 1`,
      [reportId]
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      sessionId: r.session_id,
      reporterUserId: r.reporter_user_id,
      targetUserId: r.target_user_id,
      category: r.category,
      notes: r.notes,
      status: r.status,
      reviewerNote: r.reviewer_note,
      reviewedBy: r.reviewed_by,
      reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null
    };
  }

  return moderationReports.find((r) => r.id === reportId) || null;
};

const addReportEvent = async ({ reportId, eventType, actorUserId = null, fromStatus = null, toStatus = null, note = null }) => {
  if (!pgClient) return;

  await pgClient.query(
    `insert into report_events(id, report_id, event_type, actor_user_id, from_status, to_status, note, created_at)
     values($1,$2,$3,$4,$5,$6,$7,$8)`,
    [crypto.randomUUID(), reportId, eventType, actorUserId, fromStatus, toStatus, note, new Date().toISOString()]
  );
};

const listReportEvents = async (reportId) => {
  if (!pgClient) {
    const report = moderationReports.find((r) => r.id === reportId);
    if (!report) return [];
    return [
      {
        eventType: "report_created",
        actorUserId: report.reporterUserId,
        fromStatus: null,
        toStatus: "new",
        note: report.notes || null,
        createdAt: report.createdAt
      },
      ...(report.reviewedAt
        ? [
            {
              eventType: "status_changed",
              actorUserId: report.reviewedBy,
              fromStatus: "new",
              toStatus: report.status,
              note: report.reviewerNote,
              createdAt: report.reviewedAt
            }
          ]
        : [])
    ];
  }

  const { rows } = await pgClient.query(
    `select id, report_id, event_type, actor_user_id, from_status, to_status, note, created_at
     from report_events
     where report_id = $1
     order by created_at asc`,
    [reportId]
  );

  return rows.map((r) => ({
    id: r.id,
    reportId: r.report_id,
    eventType: r.event_type,
    actorUserId: r.actor_user_id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    note: r.note,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null
  }));
};

const server = http.createServer(async (req, res) => {
  req._requestMeta = { id: crypto.randomUUID(), startedAt: Date.now() };
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  req._pathname = url.pathname;

  try {

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

  if (req.method === "GET" && url.pathname === "/ready") {
    const needsPostgres = usePostgres;
    const postgresReady = !needsPostgres || Boolean(pgClient);
    const ready = postgresReady;

    return sendJson(req, res, ready ? 200 : 503, {
      ok: ready,
      service: "interfaith-api",
      checks: {
        postgres: {
          required: needsPostgres,
          ok: postgresReady
        }
      },
      timestamp: new Date().toISOString()
    });
  }

  if (req.method === "GET" && url.pathname === "/version") {
    return sendJson(req, res, 200, {
      ok: true,
      service: "interfaith-api",
      version: {
        commitSha,
        buildTime,
        startedAt
      }
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
    const rl = checkRateLimit({ key: `auth_login:${getClientIp(req)}`, limit: 15, windowMs: 60_000 });
    if (!rl.allowed) {
      return sendJson(req, res, 429, { ok: false, error: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec });
    }

    const body = await readBody(req);
    const userId = (body.userId || "demo-user").toString();
    const token = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await storeAuthSession({ token, userId, createdAt });

    return sendJson(
      req,
      res,
      200,
      { ok: true, userId, sessionToken: token },
      { "Set-Cookie": cookieSessionValue(token) }
    );
  }

  if (req.method === "GET" && url.pathname === "/me") {
    const cookies = parseCookies(req);
    const token = cookies.interfaith_session;
    const session = await getAuthSession(token);

    if (!session) {
      return sendJson(req, res, 401, { ok: false, error: "Not authenticated" });
    }

    req._authUserId = session.userId;
    return sendJson(req, res, 200, { ok: true, userId: session.userId, sessionCreatedAt: session.createdAt });
  }

  if (req.method === "POST" && url.pathname === "/queue/join") {
    const rl = checkRateLimit({ key: `queue_join:${getClientIp(req)}`, limit: 30, windowMs: 60_000 });
    if (!rl.allowed) {
      return sendJson(req, res, 429, { ok: false, error: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec });
    }

    const body = await readBody(req);
    const userId = (body.userId || "demo-user").toString();

    const existingSession = findSessionByUser(userId);
    if (existingSession) {
      return sendJson(req, res, 200, { ok: true, alreadyMatched: true, session: existingSession });
    }

    const entry = {
      queueId: crypto.randomUUID(),
      userId,
      mode: (body.modePreference || body.mode || "voice_only").toString(),
      language: (body.language || "en").toString().toLowerCase(),
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
    const rl = checkRateLimit({ key: `queue_leave:${getClientIp(req)}`, limit: 30, windowMs: 60_000 });
    if (!rl.allowed) {
      return sendJson(req, res, 429, { ok: false, error: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec });
    }

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
    const rl = checkRateLimit({ key: `reports:${getClientIp(req)}`, limit: 20, windowMs: 60_000 });
    if (!rl.allowed) {
      return sendJson(req, res, 429, { ok: false, error: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec });
    }

    const body = await readBody(req);
    const report = {
      id: crypto.randomUUID(),
      sessionId: body.sessionId || null,
      reporterUserId: (body.reporterUserId || "demo-user").toString(),
      targetUserId: body.targetUserId || null,
      category: body.category || "other",
      notes: body.notes || "",
      status: "new",
      reviewerNote: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date().toISOString()
    };

    moderationReports.push(report);

    if (pgClient) {
      await pgClient.query(
        `insert into moderation_reports(id, session_id, reporter_user_id, target_user_id, category, notes, status, reviewer_note, reviewed_by, reviewed_at, created_at)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          report.id,
          report.sessionId,
          report.reporterUserId,
          report.targetUserId,
          report.category,
          report.notes,
          report.status,
          report.reviewerNote,
          report.reviewedBy,
          report.reviewedAt,
          report.createdAt
        ]
      );
      await addReportEvent({
        reportId: report.id,
        eventType: "report_created",
        actorUserId: report.reporterUserId,
        toStatus: "new",
        note: report.notes || null
      });
    }

    return sendJson(req, res, 201, { ok: true, report });
  }

  if (req.method === "GET" && url.pathname === "/reports") {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;

    const status = (url.searchParams.get("status") || "").toLowerCase().trim();
    const filtered = await listReports({ status });

    return sendJson(req, res, 200, {
      ok: true,
      count: filtered.length,
      reports: filtered
    });
  }

  if (req.method === "GET" && /^\/reports\/[^/]+\/history$/.test(url.pathname)) {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;

    const reportId = decodeURIComponent(url.pathname.split("/")[2] || "");
    if (!reportId) {
      return sendJson(req, res, 400, { ok: false, error: "Invalid reportId" });
    }

    const report = await getReportById(reportId);
    if (!report) {
      return sendJson(req, res, 404, { ok: false, error: "Report not found" });
    }

    const events = await listReportEvents(reportId);
    return sendJson(req, res, 200, { ok: true, reportId, count: events.length, events });
  }

  if (req.method === "POST" && url.pathname === "/reports/status") {
    const admin = await requireAdminSession(req, res);
    if (!admin) return;

    const body = await readBody(req);
    const reportId = (body.reportId || "").toString();
    const status = (body.status || "").toString().toLowerCase();
    const validStates = new Set(["new", "triaged", "actioned", "resolved"]);

    if (!reportId || !validStates.has(status)) {
      return sendJson(req, res, 400, { ok: false, error: "Invalid reportId or status" });
    }

    const report = await getReportById(reportId);
    if (!report) {
      return sendJson(req, res, 404, { ok: false, error: "Report not found" });
    }

    const fromStatus = report.status || "new";
    report.status = status;
    report.reviewerNote = (body.reviewerNote || "").toString() || null;
    report.reviewedBy = (body.reviewedBy || admin.userId || "moderator").toString();
    report.reviewedAt = new Date().toISOString();

    if (pgClient) {
      await pgClient.query(
        `update moderation_reports
         set status = $2, reviewer_note = $3, reviewed_by = $4, reviewed_at = $5
         where id = $1`,
        [report.id, report.status, report.reviewerNote, report.reviewedBy, report.reviewedAt]
      );
      await addReportEvent({
        reportId: report.id,
        eventType: "status_changed",
        actorUserId: report.reviewedBy,
        fromStatus,
        toStatus: report.status,
        note: report.reviewerNote
      });
    } else {
      const local = moderationReports.find((r) => r.id === reportId);
      if (local) {
        local.status = report.status;
        local.reviewerNote = report.reviewerNote;
        local.reviewedBy = report.reviewedBy;
        local.reviewedAt = report.reviewedAt;
      }
    }

    return sendJson(req, res, 200, { ok: true, report });
  }

  return sendJson(req, res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        requestId: req._requestMeta?.id || "unknown",
        method: req.method,
        path: req._pathname || "unknown",
        message: error?.message || "Unhandled error",
        stack: error?.stack || null
      })
    );

    return sendJson(
      req,
      res,
      500,
      isProd
        ? { ok: false, error: "Internal server error", requestId: req._requestMeta?.id }
        : { ok: false, error: error?.message || "Internal server error", requestId: req._requestMeta?.id }
    );
  }
});

initPostgresIfEnabled().finally(() => {
  validateCorsOrigins();
  server.listen(port, () => {
    console.log(`[api] listening on http://localhost:${port}`);
  });
});
