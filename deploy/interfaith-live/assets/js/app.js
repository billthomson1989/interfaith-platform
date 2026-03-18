const runtime = globalThis.__INTERFAITH_RUNTIME__ || {};
const API_BASE = runtime.apiBase || "https://api.interfaith.billthomson.elementfx.com/api";
const API_FALLBACK = runtime.apiFallback || "";

async function jf(path, opts = {}) {
  const bases = [API_BASE, API_FALLBACK].filter(Boolean);
  let lastErr;

  for (const base of bases) {
    try {
      const res = await fetch(base + path, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...opts
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, status: res.status, ...(data || {}) };
      }
      return data;
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error("All API endpoints failed");
}

const uid = () => document.getElementById("userId").value.trim() || "demo-user";

const ADMIN_IDS = new Set(["demo-admin", "ops"]);
let reportsById = new Map();

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtDate(iso) {
  if (!iso) return "n/a";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function statusColor(status) {
  switch ((status || "").toLowerCase()) {
    case "new": return "#6b7280";
    case "triaged": return "#2563eb";
    case "actioned": return "#b45309";
    case "resolved": return "#15803d";
    default: return "#6b7280";
  }
}

function statusChip(status) {
  const s = (status || "new").toLowerCase();
  return `<span style="display:inline-block;padding:.1rem .45rem;border-radius:999px;font-size:.78rem;font-weight:600;color:#fff;background:${statusColor(s)};">${escapeHtml(s)}</span>`;
}

function eventTypeLabel(eventType) {
  const normalized = (eventType || "").toLowerCase();
  if (normalized === "report_created") return "Report created";
  if (normalized === "status_changed") return "Status changed";
  return normalized ? normalized.replaceAll("_", " ") : "Event";
}

async function refreshAdminBadge() {
  const el = document.getElementById("adminBadge");
  if (!el) return;

  try {
    const d = await jf("/me");
    if (!d || !d.ok) {
      el.textContent = "Admin status: not logged in";
      return;
    }

    const isAdmin = ADMIN_IDS.has(d.userId);
    el.textContent = isAdmin
      ? `Admin status: ${d.userId} (admin)`
      : `Admin status: ${d.userId} (not admin)`;
  } catch {
    el.textContent = "Admin status: not logged in";
  }
}

async function login() {
  const d = await jf("/auth/login", { method: "POST", body: JSON.stringify({ userId: uid() }) });
  document.getElementById("authOut").textContent = JSON.stringify(d, null, 2);
  await refreshAdminBadge();
}

async function whoami() {
  const d = await jf("/me");
  document.getElementById("authOut").textContent = JSON.stringify(d, null, 2);
}

async function joinQueue() {
  const payload = {
    userId: uid(),
    modePreference: document.getElementById("mode").value,
    language: (document.getElementById("lang").value || "en").trim(),
    intentTags: ["interfaith-dialogue"]
  };
  const d = await jf("/queue/join", { method: "POST", body: JSON.stringify(payload) });
  document.getElementById("queueOut").textContent = JSON.stringify(d, null, 2);
}

async function queueStatus() {
  const d = await jf("/queue/status?userId=" + encodeURIComponent(uid()));
  document.getElementById("queueOut").textContent = JSON.stringify(d, null, 2);
}

async function leaveQueue() {
  const d = await jf("/queue/leave", { method: "POST", body: JSON.stringify({ userId: uid() }) });
  document.getElementById("queueOut").textContent = JSON.stringify(d, null, 2);
}

async function sessionStatus() {
  const d = await jf("/session/status?userId=" + encodeURIComponent(uid()));
  document.getElementById("sessionOut").textContent = JSON.stringify(d, null, 2);
}

async function endSession() {
  const d = await jf("/session/end", { method: "POST", body: JSON.stringify({ userId: uid(), reason: "ui_end" }) });
  document.getElementById("sessionOut").textContent = JSON.stringify(d, null, 2);
}

async function reportIt() {
  const payload = {
    reporterUserId: uid(),
    targetUserId: document.getElementById("target").value.trim() || null,
    category: document.getElementById("category").value,
    notes: document.getElementById("notes").value.trim(),
    sessionId: null
  };
  const d = await jf("/reports", { method: "POST", body: JSON.stringify(payload) });
  document.getElementById("reportOut").textContent = JSON.stringify(d, null, 2);
}

async function searchCitations() {
  const q = encodeURIComponent(document.getElementById("q").value.trim());
  const trad = encodeURIComponent(document.getElementById("trad").value);
  const d = await jf("/citation/search?q=" + q + "&tradition=" + trad);

  if (!d.results || !d.results.length) {
    document.getElementById("citationOut").textContent = "No results.";
    return;
  }

  document.getElementById("citationOut").innerHTML = d.results
    .map((r) => {
      const label = r.reference || r.canonical_key || r.canonicalKey || "Citation";
      const translation = r.translation || "Source";
      const body = r.text || "";
      const meta = [r.tradition, r.source].filter(Boolean).join(" • ");
      return `<div style="margin-bottom:.6rem;"><strong>${label}</strong> <em>(${translation})</em><br/>${body}<br/><span class="muted">${meta}</span></div>`;
    })
    .join("");
}

async function loadReports() {
  const status = document.getElementById("reportStatusFilter").value;
  const d = await jf("/reports" + (status ? `?status=${encodeURIComponent(status)}` : ""));

  if (!d.ok) {
    reportsById = new Map();
    const msg = d.status === 401
      ? "Not logged in as admin (401)."
      : d.status === 403
        ? `Logged in user is not admin (403: ${d.userId || "unknown"}).`
        : `Failed to load reports (${d.status || "error"}): ${d.error || "unknown"}`;
    document.getElementById("reportsOut").textContent = msg;
    return;
  }

  if (!d.reports || !d.reports.length) {
    reportsById = new Map();
    document.getElementById("reportsOut").textContent = "No reports found.";
    return;
  }

  reportsById = new Map(d.reports.map((r) => [r.id, r]));

  document.getElementById("reportsOut").innerHTML = d.reports
    .map((r) => `<div style="margin-bottom:.75rem;"><strong>${escapeHtml(r.id)}</strong> ${statusChip(r.status || "new")}<br/>${escapeHtml(r.category || "")} · ${escapeHtml(r.reporterUserId || "unknown")}<br/><span class="muted">${escapeHtml(r.notes || "")}</span><br/><button data-report-id="${escapeHtml(r.id)}" onclick="loadReportDetail(this.dataset.reportId)" style="margin-top:.35rem;">View timeline</button></div>`)
    .join("");
}

async function loadReportDetail(reportIdFromList) {
  const input = document.getElementById("detailReportId");
  const reportId = (reportIdFromList || input.value || "").trim();
  if (!reportId) {
    document.getElementById("reportDetailOut").textContent = "Enter a report ID first.";
    return;
  }

  input.value = reportId;
  document.getElementById("reviewReportId").value = reportId;

  const summary = reportsById.get(reportId);
  if (summary && summary.status && summary.status !== "new") {
    document.getElementById("detailReviewStatus").value = summary.status;
  }
  if (summary && summary.reviewedBy) {
    document.getElementById("detailReviewedBy").value = summary.reviewedBy;
  }
  if (summary && summary.reviewerNote) {
    document.getElementById("detailReviewerNote").value = summary.reviewerNote;
  }

  const d = await jf(`/reports/${encodeURIComponent(reportId)}/history`);
  if (!d.ok) {
    const msg = d.status === 401
      ? "Not logged in as admin (401)."
      : d.status === 403
        ? `Logged in user is not admin (403: ${d.userId || "unknown"}).`
        : d.status === 404
          ? "Report not found (404)."
          : `Failed to load report history (${d.status || "error"}): ${d.error || "unknown"}`;
    document.getElementById("reportDetailOut").textContent = msg;
    return;
  }

  const header = summary
    ? `<div><strong>${escapeHtml(summary.id)}</strong> ${statusChip(summary.status || "new")}<br/><span class="muted">Category: ${escapeHtml(summary.category || "other")} · Reporter: ${escapeHtml(summary.reporterUserId || "unknown")}</span><br/><span class="muted">Last review: ${escapeHtml(summary.reviewedBy || "n/a")} @ ${escapeHtml(fmtDate(summary.reviewedAt))}</span>${summary.reviewerNote ? `<br/><span class="muted">Reviewer note: ${escapeHtml(summary.reviewerNote)}</span>` : ""}</div>`
    : `<div><strong>${escapeHtml(reportId)}</strong></div>`;

  const timeline = (d.events || []).length
    ? d.events.map((evt) => {
      const from = (evt.fromStatus || "").toLowerCase();
      const to = (evt.toStatus || "").toLowerCase();
      const statusText = (from || to)
        ? `<span class="muted" style="margin-left:.35rem;">(${from ? statusChip(from) : "<span class=\"muted\">n/a</span>"} → ${to ? statusChip(to) : "<span class=\"muted\">n/a</span>"})</span>`
        : "";
      return `<li style="margin-bottom:.6rem;"><strong>${escapeHtml(eventTypeLabel(evt.eventType))}</strong>${statusText}<br/><span class="muted">${escapeHtml(fmtDate(evt.createdAt))} · ${escapeHtml(evt.actorUserId || "system")}</span>${evt.note ? `<br/>${escapeHtml(evt.note)}` : ""}</li>`;
    }).join("")
    : "<li>No history events found.</li>";

  document.getElementById("reportDetailOut").innerHTML = `${header}<hr style="border:none;border-top:1px solid #eee; margin:.75rem 0;"/><ol style="padding-left:1.2rem; margin:0;">${timeline}</ol>`;
}

async function submitModerationUpdate(payload) {
  return await jf("/reports/status", { method: "POST", body: JSON.stringify(payload) });
}

function buildModerationError(d) {
  return d.status === 401
    ? "Not logged in as admin (401)."
    : d.status === 403
      ? `Logged in user is not admin (403: ${d.userId || "unknown"}).`
      : `Failed to update report (${d.status || "error"}): ${d.error || "unknown"}`;
}

async function updateDetailReportStatus() {
  const reportId = document.getElementById("detailReportId").value.trim();
  if (!reportId) {
    document.getElementById("detailReviewOut").textContent = "Load a report detail first.";
    return;
  }

  const payload = {
    reportId,
    status: document.getElementById("detailReviewStatus").value,
    reviewerNote: document.getElementById("detailReviewerNote").value.trim(),
    reviewedBy: document.getElementById("detailReviewedBy").value.trim() || "ops"
  };

  const d = await submitModerationUpdate(payload);
  if (!d.ok) {
    document.getElementById("detailReviewOut").textContent = buildModerationError(d);
    return;
  }

  document.getElementById("detailReviewOut").textContent = JSON.stringify(d, null, 2);
  await loadReports();
  await loadReportDetail(reportId);
}

async function updateReportStatus() {
  const payload = {
    reportId: document.getElementById("reviewReportId").value.trim(),
    status: document.getElementById("reviewStatus").value,
    reviewerNote: document.getElementById("reviewerNote").value.trim(),
    reviewedBy: document.getElementById("reviewedBy").value.trim() || "ops"
  };

  const d = await submitModerationUpdate(payload);
  if (!d.ok) {
    document.getElementById("reportAdminOut").textContent = buildModerationError(d);
    return;
  }
  document.getElementById("reportAdminOut").textContent = JSON.stringify(d, null, 2);

  await loadReports();

  const currentDetailId = document.getElementById("detailReportId").value.trim();
  if (currentDetailId && d.report && d.report.id === currentDetailId) {
    await loadReportDetail(currentDetailId);
  }
}

document.getElementById("btnLogin").addEventListener("click", login);
document.getElementById("btnMe").addEventListener("click", whoami);
document.getElementById("btnJoinQueue").addEventListener("click", joinQueue);
document.getElementById("btnQueueStatus").addEventListener("click", queueStatus);
document.getElementById("btnLeaveQueue").addEventListener("click", leaveQueue);
document.getElementById("btnSessionStatus").addEventListener("click", sessionStatus);
document.getElementById("btnEndSession").addEventListener("click", endSession);
document.getElementById("btnReport").addEventListener("click", reportIt);
document.getElementById("btnSearchCitations").addEventListener("click", searchCitations);
document.getElementById("btnLoadReports").addEventListener("click", loadReports);
document.getElementById("btnLoadReportDetail").addEventListener("click", () => loadReportDetail());
document.getElementById("btnUpdateFromDetail").addEventListener("click", updateDetailReportStatus);
document.getElementById("btnUpdateReportStatus").addEventListener("click", updateReportStatus);

window.loadReportDetail = loadReportDetail;

refreshAdminBadge();
