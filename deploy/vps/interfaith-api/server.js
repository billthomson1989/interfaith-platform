const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8787;
const BASE = '/api';

app.use(express.json());
app.use(morgan('tiny'));
app.use(cors({ origin: true, credentials: true }));

const queueByUser = new Map();
const reports = [];
const dialogueSessions = new Map();

const citations = [
  { id: 'quran-2-256-en-sahih', tradition: 'islam', reference: "Qur'an 2:256", canonical_key: 'QURAN 2:256', text: 'There is no compulsion in religion.', translation: 'Sahih International', source: "Qur'an", language: 'en', tags: ['freedom', 'religion', 'conscience'] },
  { id: 'quran-5-32-en-sahih', tradition: 'islam', reference: "Qur'an 5:32", canonical_key: 'QURAN 5:32', text: 'Whoever saves one [life] - it is as if he had saved mankind entirely.', translation: 'Sahih International', source: "Qur'an", language: 'en', tags: ['life', 'ethics', 'peace'] },
  { id: 'matthew-5-9-niv', tradition: 'christianity', reference: 'Matthew 5:9', canonical_key: 'MATTHEW 5:9', text: 'Blessed are the peacemakers, for they will be called children of God.', translation: 'NIV', source: 'Bible', language: 'en', tags: ['peace', 'beatitudes'] },
  { id: 'romans-12-18-niv', tradition: 'christianity', reference: 'Romans 12:18', canonical_key: 'ROMANS 12:18', text: 'If it is possible, as far as it depends on you, live at peace with everyone.', translation: 'NIV', source: 'Bible', language: 'en', tags: ['peace', 'community'] },
  { id: 'psalms-34-14-jps', tradition: 'judaism', reference: 'Psalms 34:14', canonical_key: 'PSALMS 34:14', text: 'Turn from evil and do good; seek peace and pursue it.', translation: 'JPS', source: 'Tanakh', language: 'en', tags: ['peace', 'ethics'] },
  { id: 'leviticus-19-18-jps', tradition: 'judaism', reference: 'Leviticus 19:18', canonical_key: 'LEVITICUS 19:18', text: 'You shall love your neighbor as yourself.', translation: 'JPS', source: 'Tanakh', language: 'en', tags: ['ethics', 'neighbor', 'community'] }
];

const route = (path) => [path, BASE + path];

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
  const userId = String((req.body && req.body.userId) || 'demo-user');
  const token = 'stub-' + Buffer.from(userId).toString('base64url');
  res.json({ ok: true, token, userId });
});

app.get(route('/me'), (req, res) => {
  const userId = String(req.query.userId || 'demo-user');
  res.json({ ok: true, userId, role: 'participant' });
});

app.get(route('/auth/me'), (req, res) => {
  const userId = String(req.query.userId || 'demo-user');
  res.json({ ok: true, userId, role: 'participant' });
});

app.post(route('/queue/join'), (req, res) => {
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

  if (activeSession) {
    return res.json({ ok: true, queued: false, matched: true, session: activeSession });
  }

  const item = queueByUser.get(userId);
  if (!item) return res.json({ ok: true, queued: false, matched: false, userId, status: 'none' });

  res.json({ ok: true, queued: true, matched: false, ...item });
});

app.post(route('/queue/leave'), (req, res) => {
  const userId = String((req.body && req.body.userId) || 'demo-user');
  const removed = queueByUser.delete(userId);
  res.json({ ok: true, removed, userId, status: 'left' });
});

app.get(route('/session/status'), (req, res) => {
  const userId = String(req.query.userId || 'demo-user');
  const session = findSessionByUser(userId);

  if (!session) return res.json({ ok: true, active: false, userId });

  res.json({
    ok: true,
    active: true,
    session,
    partnerUserId: session.participants.find((id) => id !== userId) || null
  });
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
  const body = req.body || {};
  const report = {
    id: reports.length + 1,
    reporterUserId: body.reporterUserId || 'demo-user',
    targetUserId: body.targetUserId || null,
    category: body.category || 'other',
    notes: body.notes || '',
    createdAt: new Date().toISOString()
  };
  reports.push(report);
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
