const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8787;
const BASE = '/api';
const isProd = (process.env.NODE_ENV || 'development') === 'production';
const adminUserIds = new Set((process.env.ADMIN_USER_IDS || 'demo-admin,ops').split(',').map((s) => s.trim()).filter(Boolean));

app.use(express.json());
app.use(morgan('tiny'));
app.use(cors({ origin: true, credentials: true }));

const queueByUser = new Map();
const reports = [];
const dialogueSessions = new Map();
const authSessions = new Map();
const rateLimitStore = new Map();

const citations = [
  { id: 'quran-2-256-en-sahih', tradition: 'islam', reference: "Qur'an 2:256", canonical_key: 'QURAN 2:256', text: 'There is no compulsion in religion.', translation: 'Sahih International', source: "Qur'an", language: 'en', tags: ['freedom', 'religion', 'conscience'] },
  { id: 'quran-5-32-en-sahih', tradition: 'islam', reference: "Qur'an 5:32", canonical_key: 'QURAN 5:32', text: 'Whoever saves one [life] - it is as if he had saved mankind entirely.', translation: 'Sahih International', source: "Qur'an", language: 'en', tags: ['life', 'ethics', 'peace'] },
  { id: 'matthew-5-9-niv', tradition: 'christianity', reference: 'Matthew 5:9', canonical_key: 'MATTHEW 5:9', text: 'Blessed are the peacemakers, for they will be called children of God.', translation: 'NIV', source: 'Bible', language: 'en', tags: ['peace', 'beatitudes'] },
  { id: 'romans-12-18-niv', tradition: 'christianity', reference: 'Romans 12:18', canonical_key: 'ROMANS 12:18', text: 'If it is possible, as far as it depends on you, live at peace with everyone.', translation: 'NIV', source: 'Bible', language: 'en', tags: ['peace', 'community'] },
  { id: 'psalms-34-14-jps', tradition: 'judaism', reference: 'Psalms 34:14', canonical_key: 'PSALMS 34:14', text: 'Turn from evil and do good; seek peace and pursue it.', translation: 'JPS', source: 'Tanakh', language: 'en', tags: ['peace', 'ethics'] },
  { id: 'leviticus-19-18-jps', tradition: 'judaism', reference: 'Leviticus 19:18', canonical_key: 'LEVITICUS 19:18', text: 'You shall love your neighbor as yourself.', translation: 'JPS', source: 'Tanakh', language: 'en', tags: ['ethics', 'neighbor', 'community'] }
];

const route = (path) => [path, BASE + path];

const parseCookies = (req) => {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(
    raw.split(';').map((v) => v.trim()).filter(Boolean).map((pair) => {
      const idx = pair.indexOf('=');
      if (idx === -1) return [pair, ''];
      return [pair.slice(0, idx), decodeURIComponent(pair.slice(idx + 1))];
    })
  );
};

const getClientIp = (req) => {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
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
  if (bucket.count > limit) return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  return { allowed: true };
};

const cookieSessionValue = (token) => {
  const parts = [`interfaith_session=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=86400'];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
};

const requireAdminSession = (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies.interfaith_session;
  const session = token ? authSessions.get(token) : null;
  if (!session) {
    res.status(401).json({ ok: false, error: 'Admin auth required' });
    return null;
  }
  if (!adminUserIds.has(session.userId)) {
    res.status(403).json({ ok: false, error: 'Admin role required', userId: session.userId });
    return null;
  }
  return session;
};

function rankCitation(item, q) {
  if (!q) return 1;
  const query = q.toLowerCase();
  const fields = [
    (item.reference || '').toLowerCase(),
    (item.canonical_key || '').toLowerCase(),
    (item.text || '').toLowerCase(),
    (item.translation || '').toLowerCase(),
    (item.source || '').toLowerCase(),
    (item.tradition || '').toLowerCase(),
    (item.tags || []).join(' ').toLowerCase()
  ];
  let score = 0;
  if (fields[0].includes(query)) score += 8;
  if (fields[1].includes(query)) score += 7;
  if (fields[2].includes(query)) score += 4;
  if (fields[6].includes(query)) score += 3;
  if (fields[3].includes(query)) score += 2;
  if (fields[4].includes(query)) score += 2;
  if (fields[5].includes(query)) score += 1;
  return score;
}

function resolveMatchedMode(a, b) {
  const left = (a || '').toString();
  const right = (b || '').toString();
  if (left === right) return left;
  const pair = new Set([left, right]);
  if (pair.has('voice_only') && pair.has('voice_then_video')) return 'voice_then_video';
  return null;
}

function canMatch(a, b) {
  const sameLanguage = (a.language || '').toLowerCase() === (b.language || '').toLowerCase();
  return sameLanguage && Boolean(resolveMatchedMode(a.mode, b.mode));
}

function tryMatchForUser(newEntry) {
  const candidate = [...queueByUser.values()]
    .filter((c) => c.userId !== newEntry.userId)
    .filter((c) => canMatch(newEntry, c))
    .sort((a, b) => new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime())[0];

  if (!candidate) return null;

  const now = new Date().toISOString();
  const session = {
    sessionId: crypto.randomUUID(),
    state: 'active',
    mode: resolveMatchedMode(newEntry.mode, candidate.mode) || newEntry.mode,
    language: (newEntry.language || 'en').toLowerCase(),
    participants: [newEntry.userId, candidate.userId].sort(),
    matchedAt: now,
    startedAt: now,
    endedAt: null,
    endedReason: null
  };

  dialogueSessions.set(session.sessionId, session);
  queueByUser.delete(newEntry.userId);
  queueByUser.delete(candidate.userId);
  return session;
}

function findSessionByUser(userId) {
  for (const session of dialogueSessions.values()) {
    if (session.participants.includes(userId) && session.state !== 'ended') return session;
  }
  return null;
}

app.get(route('/health'), (_req, res) => {
  res.json({
    ok: true,
    service: 'interfaith-api',
    persistence: (process.env.USE_POSTGRES === 'true' ? 'postgres' : 'memory'),
    citationSource: 'dataset',
    activeSessions: [...dialogueSessions.values()].filter((s) => s.state !== 'ended').length,
    queueDepth: queueByUser.size,
    ts: new Date().toISOString()
  });
});

app.post(route('/auth/login'), (req, res) => {
  const rl = checkRateLimit({ key: `auth_login:${getClientIp(req)}`, limit: 15, windowMs: 60_000 });
  if (!rl.allowed) return res.status(429).json({ ok: false, error: 'Rate limit exceeded', retryAfterSec: rl.retryAfterSec });

  const userId = String((req.body && req.body.userId) || 'demo-user');
  const token = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  authSessions.set(token, { userId, createdAt });
  res.setHeader('Set-Cookie', cookieSessionValue(token));
  res.json({ ok: true, token, userId, sessionToken: token });
});

app.get(route('/me'), (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies.interfaith_session;
  const session = token ? authSessions.get(token) : null;
  if (!session) return res.status(401).json({ ok: false, error: 'Not authenticated' });
  res.json({ ok: true, userId: session.userId, sessionCreatedAt: session.createdAt });
});

app.get(route('/auth/me'), (req, res) => {
  const userId = String(req.query.userId || 'demo-user');
  res.json({ ok: true, userId, role: 'participant' });
});

app.post(route('/queue/join'), (req, res) => {
  const rl = checkRateLimit({ key: `queue_join:${getClientIp(req)}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return res.status(429).json({ ok: false, error: 'Rate limit exceeded', retryAfterSec: rl.retryAfterSec });

  const body = req.body || {};
  const userId = String(body.userId || 'demo-user');

  const existingSession = findSessionByUser(userId);
  if (existingSession) return res.json({ ok: true, alreadyMatched: true, session: existingSession });

  const entry = {
    queueId: crypto.randomUUID(),
    userId,
    mode: String(body.modePreference || body.mode || 'voice_only'),
    language: String(body.language || 'en').toLowerCase(),
    intentTags: Array.isArray(body.intentTags) ? body.intentTags : [],
    queuedAt: new Date().toISOString()
  };

  queueByUser.set(userId, entry);

  const matchedSession = tryMatchForUser(entry);
  if (matchedSession) return res.json({ ok: true, matched: true, queued: false, session: matchedSession });

  res.json({ ok: true, matched: false, queued: true, ...entry });
});

app.get(route('/queue/status'), (req, res) => {
  const userId = String(req.query.userId || 'demo-user');
  const activeSession = findSessionByUser(userId);

  if (activeSession) return res.json({ ok: true, queued: false, matched: true, session: activeSession });

  const item = queueByUser.get(userId);
  if (!item) return res.json({ ok: true, queued: false, matched: false, userId, status: 'none' });

  res.json({ ok: true, queued: true, matched: false, ...item });
});

app.post(route('/queue/leave'), (req, res) => {
  const rl = checkRateLimit({ key: `queue_leave:${getClientIp(req)}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return res.status(429).json({ ok: false, error: 'Rate limit exceeded', retryAfterSec: rl.retryAfterSec });

  const userId = String((req.body && req.body.userId) || 'demo-user');
  const removed = queueByUser.delete(userId);
  res.json({ ok: true, removed, userId, status: 'left' });
});

app.get(route('/session/status'), (req, res) => {
  const userId = String(req.query.userId || 'demo-user');
  const session = findSessionByUser(userId);

  if (!session) return res.json({ ok: true, active: false, userId });

  res.json({ ok: true, active: true, session, partnerUserId: session.participants.find((id) => id !== userId) || null });
});

app.post(route('/session/end'), (req, res) => {
  const body = req.body || {};
  const userId = String(body.userId || 'demo-user');
  const reason = String(body.reason || 'user_ended');
  const session = findSessionByUser(userId);

  if (!session) return res.status(404).json({ ok: false, error: 'No active session for user' });

  session.state = 'ended';
  session.endedAt = new Date().toISOString();
  session.endedReason = reason;

  res.json({ ok: true, ended: true, session });
});

app.post(route('/reports'), (req, res) => {
  const rl = checkRateLimit({ key: `reports:${getClientIp(req)}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return res.status(429).json({ ok: false, error: 'Rate limit exceeded', retryAfterSec: rl.retryAfterSec });

  const body = req.body || {};
  const report = {
    id: crypto.randomUUID(),
    reporterUserId: body.reporterUserId || 'demo-user',
    targetUserId: body.targetUserId || null,
    category: body.category || 'other',
    notes: body.notes || '',
    status: 'new',
    reviewerNote: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date().toISOString()
  };
  reports.push(report);
  res.json({ ok: true, report });
});

app.get(route('/reports'), (req, res) => {
  const admin = requireAdminSession(req, res);
  if (!admin) return;

  const status = String(req.query.status || '').toLowerCase().trim();
  const validStates = new Set(['new', 'triaged', 'actioned', 'resolved']);
  const filtered = !status || !validStates.has(status) ? reports : reports.filter((r) => (r.status || 'new') === status);
  res.json({ ok: true, count: filtered.length, reports: filtered.slice(-50) });
});

app.post(route('/reports/status'), (req, res) => {
  const admin = requireAdminSession(req, res);
  if (!admin) return;

  const body = req.body || {};
  const reportId = String(body.reportId || '');
  const status = String(body.status || '').toLowerCase();
  const validStates = new Set(['new', 'triaged', 'actioned', 'resolved']);

  if (!reportId || !validStates.has(status)) return res.status(400).json({ ok: false, error: 'Invalid reportId or status' });

  const report = reports.find((r) => r.id === reportId);
  if (!report) return res.status(404).json({ ok: false, error: 'Report not found' });

  report.status = status;
  report.reviewerNote = String(body.reviewerNote || '') || null;
  report.reviewedBy = String(body.reviewedBy || admin.userId || 'moderator');
  report.reviewedAt = new Date().toISOString();

  res.json({ ok: true, report });
});

app.get(route('/citation/search'), (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const tradition = String(req.query.tradition || req.query.trad || '').trim().toLowerCase();
  const language = String(req.query.language || '').trim().toLowerCase();
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 25)));

  const results = citations
    .map((item) => ({ item, score: rankCitation(item, q) }))
    .filter(({ item, score }) => {
      const qMatch = !q || score > 0;
      const tMatch = !tradition || item.tradition === tradition;
      const lMatch = !language || item.language === language;
      return qMatch && tMatch && lMatch;
    })
    .sort((a, b) => b.score - a.score || a.item.reference.localeCompare(b.item.reference))
    .slice(0, limit)
    .map(({ item }) => ({ ...item, canonicalKey: item.canonical_key }));

  res.json({ ok: true, count: results.length, q: q || '', tradition: tradition || null, language: language || null, source: 'json', results });
});

app.listen(PORT, '127.0.0.1', () => console.log('interfaith-api listening on 127.0.0.1:' + PORT));
