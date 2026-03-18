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
      body { font-family: Arial, sans-serif; margin: 2rem; max-width: 900px; }
      .card { border: 1px solid #ddd; border-radius: 10px; padding: 1rem; margin-top: 1rem; }
      code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
      label { display:block; margin-top: .5rem; font-size: .9rem; }
      input, select, button, textarea { padding: .5rem; margin-top: .25rem; }
      textarea { width: 100%; min-height: 70px; }
      .row { display:flex; gap:.75rem; flex-wrap: wrap; }
      .result { background:#fafafa; border:1px solid #eee; padding:.75rem; border-radius:8px; margin-top:.5rem; white-space: pre-wrap; }
      .muted { color:#666; font-size:.9rem; }
    </style>
  </head>
  <body>
    <h1>Interfaith Platform — Sprint 1 Shell</h1>
    <p class="muted">API target: <code>${apiUrl}</code></p>

    <div class="card">
      <h3>Auth (stub)</h3>
      <p id="adminBadge" class="muted">Admin status: unknown</p>
      <div class="row">
        <div>
          <label>User ID</label>
          <input id="userId" value="demo-user" />
        </div>
        <div style="align-self:flex-end;">
          <button onclick="login()">Login</button>
          <button onclick="me()">Who am I?</button>
        </div>
      </div>
      <pre id="authOut" class="result">Not logged in.</pre>
    </div>

    <div class="card">
      <h3>Queue</h3>
      <div class="row">
        <div>
          <label>Mode</label>
          <select id="mode">
            <option value="voice_only">Voice only</option>
            <option value="voice_then_video">Voice then video</option>
          </select>
        </div>
        <div>
          <label>Language</label>
          <input id="language" value="en" />
        </div>
      </div>
      <div class="row" style="margin-top:.75rem;">
        <button onclick="joinQueue()">Join queue</button>
        <button onclick="queueStatus()">Check status</button>
        <button onclick="leaveQueue()">Leave queue</button>
      </div>
      <pre id="queueOut" class="result">No queue action yet.</pre>
    </div>

    <div class="card">
      <h3>Session</h3>
      <div class="row" style="margin-top:.25rem;">
        <button onclick="sessionStatus()">Session status</button>
        <button onclick="endSession()">End session</button>
      </div>
      <pre id="sessionOut" class="result">No session action yet.</pre>
    </div>

    <div class="card">
      <h3>Moderation report</h3>
      <div class="row">
        <div>
          <label>Category</label>
          <select id="reportCategory">
            <option value="harassment">harassment</option>
            <option value="hate">hate</option>
            <option value="misinformation">misinformation</option>
            <option value="sexual-content">sexual-content</option>
            <option value="other" selected>other</option>
          </select>
        </div>
        <div>
          <label>Target user (optional)</label>
          <input id="targetUserId" placeholder="other-user" />
        </div>
      </div>
      <label>Notes</label>
      <textarea id="reportNotes" placeholder="What happened?"></textarea>
      <div class="row" style="margin-top:.75rem;">
        <button onclick="submitReport()">Submit report</button>
      </div>
      <pre id="reportOut" class="result">No report submitted.</pre>
    </div>

    <div class="card">
      <h3>Moderation admin</h3>
      <p class="muted">Admin login required. Use an admin user (default: <code>demo-admin</code> or <code>ops</code>).</p>
      <div class="row">
        <div>
          <label>Status filter</label>
          <select id="reportStatusFilter">
            <option value="">All</option>
            <option value="new">new</option>
            <option value="triaged">triaged</option>
            <option value="actioned">actioned</option>
            <option value="resolved">resolved</option>
          </select>
        </div>
        <div style="align-self:flex-end;">
          <button onclick="loadReports()">Load reports</button>
        </div>
      </div>
      <div id="reportsOut" class="result">No reports loaded.</div>

      <h4 style="margin-top:1rem; margin-bottom:.4rem;">Report detail</h4>
      <p class="muted" style="margin-top:0;">Select a report from the list or enter an ID to load history timeline.</p>
      <div class="row">
        <div>
          <label>Detail report ID</label>
          <input id="detailReportId" placeholder="report-id" />
        </div>
        <div style="align-self:flex-end;">
          <button onclick="loadReportDetail()">Load detail</button>
        </div>
      </div>
      <div id="reportDetailOut" class="result">No report detail loaded.</div>

      <div class="row">
        <div>
          <label>Detail new status</label>
          <select id="detailReviewStatus">
            <option value="triaged">triaged</option>
            <option value="actioned">actioned</option>
            <option value="resolved">resolved</option>
          </select>
        </div>
        <div>
          <label>Detail reviewer</label>
          <input id="detailReviewedBy" value="ops" />
        </div>
      </div>
      <label>Detail reviewer note</label>
      <textarea id="detailReviewerNote" placeholder="Moderator action note"></textarea>
      <div class="row" style="margin-top:.75rem;">
        <button onclick="updateDetailReportStatus()">Update from detail panel</button>
      </div>
      <pre id="detailReviewOut" class="result">No detail moderation action yet.</pre>

      <div class="row">
        <div>
          <label>Report ID</label>
          <input id="reviewReportId" placeholder="report-id" />
        </div>
        <div>
          <label>New status</label>
          <select id="reviewStatus">
            <option value="triaged">triaged</option>
            <option value="actioned">actioned</option>
            <option value="resolved">resolved</option>
          </select>
        </div>
        <div>
          <label>Reviewer</label>
          <input id="reviewedBy" value="ops" />
        </div>
      </div>
      <label>Reviewer note</label>
      <textarea id="reviewerNote"></textarea>
      <div class="row" style="margin-top:.75rem;">
        <button onclick="updateReportStatus()">Update report status</button>
      </div>
      <pre id="reportAdminOut" class="result">No moderation action yet.</pre>
    </div>

    <div class="card">
      <h3>Citation search</h3>
      <div class="row">
        <div>
          <label>Search query</label>
          <input id="citationQ" placeholder="peace" value="peace" />
        </div>
        <div>
          <label>Tradition</label>
          <select id="tradition">
            <option value="">All</option>
            <option value="islam">Islam</option>
            <option value="christianity">Christianity</option>
            <option value="judaism">Judaism</option>
          </select>
        </div>
        <div style="align-self:flex-end;">
          <button onclick="searchCitations()">Search</button>
        </div>
      </div>
      <div id="citationOut" class="result">No citation search yet.</div>
    </div>

    <script>
      const API = ${JSON.stringify(apiUrl)};

      async function jfetch(path, options = {}) {
        const res = await fetch(API + path, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          ...options
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, status: res.status, ...(data || {}) };
        }
        return data;
      }

      function currentUserId() {
        return document.getElementById('userId').value.trim() || 'demo-user';
      }

      const ADMIN_IDS = new Set(['demo-admin', 'ops']);
      let reportsById = new Map();

      function escapeHtml(value) {
        return String(value || '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function fmtDate(iso) {
        if (!iso) return 'n/a';
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
      }

      async function refreshAdminBadge() {
        const el = document.getElementById('adminBadge');
        if (!el) return;

        try {
          const d = await jfetch('/me');
          if (!d || !d.ok) {
            el.textContent = 'Admin status: not logged in';
            return;
          }

          const isAdmin = ADMIN_IDS.has(d.userId);
          el.textContent = isAdmin
            ? 'Admin status: ' + d.userId + ' (admin)'
            : 'Admin status: ' + d.userId + ' (not admin)';
        } catch {
          el.textContent = 'Admin status: not logged in';
        }
      }

      async function login() {
        const data = await jfetch('/auth/login', { method: 'POST', body: JSON.stringify({ userId: currentUserId() }) });
        document.getElementById('authOut').textContent = JSON.stringify(data, null, 2);
        await refreshAdminBadge();
      }

      async function me() {
        const data = await jfetch('/me');
        document.getElementById('authOut').textContent = JSON.stringify(data, null, 2);
      }

      function getQueuePayload() {
        return {
          userId: currentUserId(),
          modePreference: document.getElementById('mode').value,
          language: document.getElementById('language').value.trim() || 'en',
          intentTags: ['interfaith-dialogue']
        };
      }

      async function joinQueue() {
        const data = await jfetch('/queue/join', { method: 'POST', body: JSON.stringify(getQueuePayload()) });
        document.getElementById('queueOut').textContent = JSON.stringify(data, null, 2);
      }

      async function queueStatus() {
        const userId = encodeURIComponent(currentUserId());
        const data = await jfetch('/queue/status?userId=' + userId);
        document.getElementById('queueOut').textContent = JSON.stringify(data, null, 2);
      }

      async function leaveQueue() {
        const data = await jfetch('/queue/leave', { method: 'POST', body: JSON.stringify({ userId: currentUserId() }) });
        document.getElementById('queueOut').textContent = JSON.stringify(data, null, 2);
      }

      async function sessionStatus() {
        const userId = encodeURIComponent(currentUserId());
        const data = await jfetch('/session/status?userId=' + userId);
        document.getElementById('sessionOut').textContent = JSON.stringify(data, null, 2);
      }

      async function endSession() {
        const data = await jfetch('/session/end', { method: 'POST', body: JSON.stringify({ userId: currentUserId(), reason: 'ui_end' }) });
        document.getElementById('sessionOut').textContent = JSON.stringify(data, null, 2);
      }

      async function submitReport() {
        const payload = {
          reporterUserId: currentUserId(),
          targetUserId: document.getElementById('targetUserId').value.trim() || null,
          category: document.getElementById('reportCategory').value,
          notes: document.getElementById('reportNotes').value.trim(),
          sessionId: null
        };

        const data = await jfetch('/reports', { method: 'POST', body: JSON.stringify(payload) });
        document.getElementById('reportOut').textContent = JSON.stringify(data, null, 2);
      }

      async function loadReports() {
        const status = encodeURIComponent(document.getElementById('reportStatusFilter').value);
        const data = await jfetch('/reports' + (status ? ('?status=' + status) : ''));

        if (!data.ok) {
          reportsById = new Map();
          const msg = data.status === 401
            ? 'Not logged in as admin (401).'
            : data.status === 403
              ? 'Logged in user is not admin (403: ' + (data.userId || 'unknown') + ').'
              : 'Failed to load reports (' + (data.status || 'error') + '): ' + (data.error || 'unknown');
          document.getElementById('reportsOut').textContent = msg;
          return;
        }

        if (!data.reports || !data.reports.length) {
          reportsById = new Map();
          document.getElementById('reportsOut').textContent = 'No reports found.';
          return;
        }

        reportsById = new Map(data.reports.map((r) => [r.id, r]));

        document.getElementById('reportsOut').innerHTML = data.reports
          .map((r) => '<div style="margin-bottom:.75rem;">'
            + '<strong>' + escapeHtml(r.id) + '</strong> · <em>' + escapeHtml(r.status || 'new') + '</em>'
            + '<br/>' + escapeHtml(r.category || '') + ' · ' + escapeHtml(r.reporterUserId || '')
            + '<br/><span class="muted">' + escapeHtml(r.notes || '') + '</span>'
            + '<br/><button onclick="loadReportDetail(\'' + escapeHtml(r.id) + '\')" style="margin-top:.35rem;">View timeline</button>'
            + '</div>')
          .join('');
      }

      async function loadReportDetail(reportIdFromList) {
        const input = document.getElementById('detailReportId');
        const reportId = (reportIdFromList || input.value || '').trim();
        if (!reportId) {
          document.getElementById('reportDetailOut').textContent = 'Enter a report ID first.';
          return;
        }

        input.value = reportId;
        document.getElementById('reviewReportId').value = reportId;

        const summary = reportsById.get(reportId);

        if (summary && summary.status && summary.status !== 'new') {
          document.getElementById('detailReviewStatus').value = summary.status;
        }
        if (summary && summary.reviewedBy) {
          document.getElementById('detailReviewedBy').value = summary.reviewedBy;
        }
        if (summary && summary.reviewerNote) {
          document.getElementById('detailReviewerNote').value = summary.reviewerNote;
        }

        const data = await jfetch('/reports/' + encodeURIComponent(reportId) + '/history');

        if (!data.ok) {
          const msg = data.status === 401
            ? 'Not logged in as admin (401).'
            : data.status === 403
              ? 'Logged in user is not admin (403: ' + (data.userId || 'unknown') + ').'
              : data.status === 404
                ? 'Report not found (404).'
                : 'Failed to load report history (' + (data.status || 'error') + '): ' + (data.error || 'unknown');
          document.getElementById('reportDetailOut').textContent = msg;
          return;
        }

        const header = summary
          ? '<div><strong>' + escapeHtml(summary.id) + '</strong> · <em>' + escapeHtml(summary.status || 'new') + '</em>'
            + '<br/><span class="muted">Category: ' + escapeHtml(summary.category || 'other') + ' · Reporter: ' + escapeHtml(summary.reporterUserId || 'unknown') + '</span>'
            + '<br/><span class="muted">Last review: ' + escapeHtml(summary.reviewedBy || 'n/a') + ' @ ' + escapeHtml(fmtDate(summary.reviewedAt)) + '</span>'
            + (summary.reviewerNote ? '<br/><span class="muted">Reviewer note: ' + escapeHtml(summary.reviewerNote) + '</span>' : '')
            + '</div>'
          : '<div><strong>' + escapeHtml(reportId) + '</strong></div>';

        const timeline = (data.events || []).length
          ? data.events.map((evt) => {
              const statusText = evt.fromStatus || evt.toStatus
                ? ' [' + (evt.fromStatus || 'n/a') + ' → ' + (evt.toStatus || 'n/a') + ']'
                : '';
              return '<li style="margin-bottom:.5rem;">'
                + '<strong>' + escapeHtml(evt.eventType || 'event') + '</strong>' + escapeHtml(statusText)
                + '<br/><span class="muted">' + escapeHtml(fmtDate(evt.createdAt)) + ' · ' + escapeHtml(evt.actorUserId || 'system') + '</span>'
                + (evt.note ? '<br/>' + escapeHtml(evt.note) : '')
                + '</li>';
            }).join('')
          : '<li>No history events found.</li>';

        document.getElementById('reportDetailOut').innerHTML = header + '<hr style="border:none;border-top:1px solid #eee; margin:.75rem 0;"/><ol style="padding-left:1.2rem; margin:0;">' + timeline + '</ol>';
      }

      async function submitModerationUpdate(payload) {
        return await jfetch('/reports/status', { method: 'POST', body: JSON.stringify(payload) });
      }

      function buildModerationError(data) {
        return data.status === 401
          ? 'Not logged in as admin (401).'
          : data.status === 403
            ? 'Logged in user is not admin (403: ' + (data.userId || 'unknown') + ').'
            : 'Failed to update report (' + (data.status || 'error') + '): ' + (data.error || 'unknown');
      }

      async function updateDetailReportStatus() {
        const reportId = document.getElementById('detailReportId').value.trim();
        if (!reportId) {
          document.getElementById('detailReviewOut').textContent = 'Load a report detail first.';
          return;
        }

        const payload = {
          reportId,
          status: document.getElementById('detailReviewStatus').value,
          reviewerNote: document.getElementById('detailReviewerNote').value.trim(),
          reviewedBy: document.getElementById('detailReviewedBy').value.trim() || 'ops'
        };

        const data = await submitModerationUpdate(payload);
        if (!data.ok) {
          document.getElementById('detailReviewOut').textContent = buildModerationError(data);
          return;
        }

        document.getElementById('detailReviewOut').textContent = JSON.stringify(data, null, 2);
        await loadReports();
        await loadReportDetail(reportId);
      }

      async function updateReportStatus() {
        const payload = {
          reportId: document.getElementById('reviewReportId').value.trim(),
          status: document.getElementById('reviewStatus').value,
          reviewerNote: document.getElementById('reviewerNote').value.trim(),
          reviewedBy: document.getElementById('reviewedBy').value.trim() || 'ops'
        };

        const data = await submitModerationUpdate(payload);
        if (!data.ok) {
          document.getElementById('reportAdminOut').textContent = buildModerationError(data);
          return;
        }
        document.getElementById('reportAdminOut').textContent = JSON.stringify(data, null, 2);

        await loadReports();

        const currentDetailId = document.getElementById('detailReportId').value.trim();
        if (currentDetailId && data.report && data.report.id === currentDetailId) {
          await loadReportDetail(currentDetailId);
        }
      }

      async function searchCitations() {
        const q = encodeURIComponent(document.getElementById('citationQ').value.trim());
        const tradition = encodeURIComponent(document.getElementById('tradition').value);
        const data = await jfetch('/citation/search?q=' + q + '&tradition=' + tradition);

        if (!data.results || !data.results.length) {
          document.getElementById('citationOut').textContent = 'No results.';
          return;
        }

        document.getElementById('citationOut').innerHTML = data.results
          .map((r) => {
            const label = r.reference || r.canonical_key || r.canonicalKey || 'Citation';
            const translation = r.translation || 'Source';
            const body = r.text || '';
            const meta = [r.tradition, r.source].filter(Boolean).join(' • ');
            return '<div style="margin-bottom:.6rem;"><strong>' + label + '</strong> <em>(' + translation + ')</em><br/>' + body + '<br/><span class="muted">' + meta + '</span></div>';
          })
          .join('');
      }

      refreshAdminBadge();
    </script>
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
