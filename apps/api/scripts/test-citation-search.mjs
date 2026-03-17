import { setTimeout as sleep } from "node:timers/promises";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const API_PORT = Number(process.env.TEST_API_PORT || 4200);
const API_BASE_URL = `http://127.0.0.1:${API_PORT}`;

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

async function jget(path) {
  const res = await fetch(API_BASE_URL + path);
  const data = await res.json();
  return { status: res.status, data };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      API_PORT: String(API_PORT),
      CORS_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000"
    },
    stdio: "pipe"
  });

  child.stdout.on("data", (d) => process.stdout.write(d));
  child.stderr.on("data", (d) => process.stderr.write(d));

  try {
    await waitForHealth(`${API_BASE_URL}/health`);

    const health = await jget("/health");
    assert.equal(health.status, 200);
    assert.equal(health.data.ok, true);

    const quran = await jget("/citation/search?q=quran");
    assert.equal(quran.status, 200);
    assert.equal(quran.data.ok, true);
    assert.ok(quran.data.count > 0);
    assert.ok(quran.data.results[0].canonical_key || quran.data.results[0].canonicalKey);

    const christianity = await jget("/citation/search?q=peace&tradition=christianity");
    assert.equal(christianity.status, 200);
    assert.ok(christianity.data.results.every((r) => r.tradition === "christianity"));

    const limited = await jget("/citation/search?q=peace&limit=1");
    assert.equal(limited.status, 200);
    assert.equal(limited.data.results.length, 1);

    const byLanguage = await jget("/citation/search?language=en");
    assert.equal(byLanguage.status, 200);
    assert.ok(byLanguage.data.results.length > 0);
    assert.ok(byLanguage.data.results.every((r) => r.language === "en"));

    console.log("✅ Citation search API tests passed");
  } finally {
    child.kill("SIGTERM");
    await sleep(300);
    if (!child.killed) child.kill("SIGKILL");
  }
}

main().catch((err) => {
  console.error("❌ Citation search API tests failed", err);
  process.exitCode = 1;
});
