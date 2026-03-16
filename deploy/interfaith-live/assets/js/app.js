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
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error("All API endpoints failed");
}

const uid = () => document.getElementById("userId").value.trim() || "demo-user";

async function login() {
  const d = await jf("/auth/login", { method: "POST", body: JSON.stringify({ userId: uid() }) });
  document.getElementById("authOut").textContent = JSON.stringify(d, null, 2);
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

document.getElementById("btnLogin").addEventListener("click", login);
document.getElementById("btnMe").addEventListener("click", whoami);
document.getElementById("btnJoinQueue").addEventListener("click", joinQueue);
document.getElementById("btnQueueStatus").addEventListener("click", queueStatus);
document.getElementById("btnLeaveQueue").addEventListener("click", leaveQueue);
document.getElementById("btnSessionStatus").addEventListener("click", sessionStatus);
document.getElementById("btnEndSession").addEventListener("click", endSession);
document.getElementById("btnReport").addEventListener("click", reportIt);
document.getElementById("btnSearchCitations").addEventListener("click", searchCitations);
