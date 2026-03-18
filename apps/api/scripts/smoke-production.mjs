const BASE = process.env.API_BASE_URL || "https://api.interfaith.billthomson.elementfx.com/api";
const adminUser = process.env.SMOKE_ADMIN_USER_ID || "demo-admin";
const nonAdminUser = process.env.SMOKE_NON_ADMIN_USER_ID || "demo-user";

async function j(method, path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { res, data, text };
}

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  console.log(`[smoke] BASE=${BASE}`);

  const ready = await j("GET", "/ready");
  must(ready.res.status === 200 && ready.data?.ok === true, `ready failed: ${ready.res.status} ${ready.text}`);

  const version = await j("GET", "/version");
  must(version.res.status === 200 && version.data?.ok === true, `version failed: ${version.res.status} ${version.text}`);

  const citation = await j("GET", "/citation/search?q=peace&tradition=christianity&limit=1");
  must(citation.res.status === 200 && citation.data?.ok === true, `citation failed: ${citation.res.status} ${citation.text}`);

  const loginUser = await j("POST", "/auth/login", { userId: nonAdminUser });
  const userCookie = (loginUser.res.headers.get("set-cookie") || "").split(";")[0];
  must(loginUser.res.status === 200 && userCookie, `non-admin login failed: ${loginUser.res.status}`);

  const denied = await j("GET", "/reports", undefined, userCookie);
  must(denied.res.status === 403, `non-admin gate expected 403, got ${denied.res.status}`);

  const loginAdmin = await j("POST", "/auth/login", { userId: adminUser });
  const adminCookie = (loginAdmin.res.headers.get("set-cookie") || "").split(";")[0];
  must(loginAdmin.res.status === 200 && adminCookie, `admin login failed: ${loginAdmin.res.status}`);

  const reports = await j("GET", "/reports", undefined, adminCookie);
  must(reports.res.status === 200, `admin reports expected 200, got ${reports.res.status}`);

  const created = await j("POST", "/reports", {
    reporterUserId: adminUser,
    category: "other",
    notes: "smoke-production moderation report"
  }, adminCookie);
  must(created.res.status === 200 && created.data?.report?.id, `report create failed: ${created.res.status} ${created.text}`);

  const reportId = created.data.report.id;
  const updated = await j("POST", "/reports/status", {
    reportId,
    status: "triaged",
    reviewerNote: "smoke triage",
    reviewedBy: adminUser
  }, adminCookie);
  must(updated.res.status === 200 && updated.data?.report?.status === "triaged", `report status failed: ${updated.res.status} ${updated.text}`);

  const history = await j("GET", `/reports/${reportId}/history`, undefined, adminCookie);
  must(history.res.status === 200 && Array.isArray(history.data?.events), `report history failed: ${history.res.status} ${history.text}`);

  console.log("✅ Production smoke passed");
})();
