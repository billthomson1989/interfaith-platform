import { setTimeout as sleep } from "node:timers/promises";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const API_PORT = Number(process.env.TEST_API_PORT || 4500);
const API_BASE_URL = `http://127.0.0.1:${API_PORT}`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function waitForHealth(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error(`API healthcheck timed out: ${url}`);
}

async function main() {
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, API_PORT: String(API_PORT), USE_POSTGRES: "false" },
    stdio: "pipe"
  });

  child.stdout.on("data", (d) => process.stdout.write(d));
  child.stderr.on("data", (d) => process.stderr.write(d));

  try {
    await waitForHealth(`${API_BASE_URL}/health`);

    const createdRes = await fetch(`${API_BASE_URL}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reporterUserId: "mod-user", category: "other", notes: "needs review" })
    });
    const created = await createdRes.json();
    assert.equal(createdRes.status, 201);
    assert.equal(created.report.status, "new");

    const updateRes = await fetch(`${API_BASE_URL}/reports/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId: created.report.id, status: "triaged", reviewerNote: "checked", reviewedBy: "ops" })
    });
    const updated = await updateRes.json();
    assert.equal(updateRes.status, 200);
    assert.equal(updated.report.status, "triaged");

    const filteredRes = await fetch(`${API_BASE_URL}/reports?status=triaged`);
    const filtered = await filteredRes.json();
    assert.equal(filteredRes.status, 200);
    assert.ok(filtered.reports.some((r) => r.id === created.report.id));

    console.log("✅ Moderation workflow tests passed");
  } finally {
    child.kill("SIGTERM");
    await sleep(250);
    if (!child.killed) child.kill("SIGKILL");
  }
}

main().catch((err) => {
  console.error("❌ Moderation workflow tests failed", err);
  process.exitCode = 1;
});
