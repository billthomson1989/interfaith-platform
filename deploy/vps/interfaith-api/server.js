const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 8787;
const BASE = '/api';

app.use(express.json());
app.use(morgan('tiny'));
app.use(cors({ origin: true, credentials: true }));

const queue = new Map();
const reports = [];

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

app.get(route('/health'), (_req, res) => {
  res.json({ ok: true, service: 'interfaith-api', persistence: (process.env.USE_POSTGRES === 'true' ? 'postgres' : 'memory'), citationSource: 'dataset', ts: new Date().toISOString() });
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
  const mode = String(body.modePreference || body.mode || 'voice_only');
  const language = String(body.language || 'en');
  const joinedAt = Date.now();
  queue.set(userId, { mode, language, joinedAt, status: 'queued' });
  res.json({ ok: true, userId, mode, language, joinedAt, status: 'queued' });
});

app.get(route('/queue/status'), (req, res) => {
  const userId = String(req.query.userId || 'demo-user');
  const item = queue.get(userId);
  if (!item) return res.json({ ok: true, userId, status: 'none' });
  res.json({ ok: true, userId, ...item });
});

app.post(route('/queue/leave'), (req, res) => {
  const userId = String((req.body && req.body.userId) || 'demo-user');
  queue.delete(userId);
  res.json({ ok: true, userId, status: 'left' });
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
