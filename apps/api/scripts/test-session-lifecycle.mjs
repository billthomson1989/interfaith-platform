import { setTimeout as sleep } from "node:timers/promises";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const API_PORT = Number(process.env.TEST_API_PORT || 4300);
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

async function jget(pathname) {
  const res = await fetch(API_BASE_URL + pathname);
  return { status: res.status, data: await res.json() };
}

async function jpost(pathname, body) {
  const res = await fetch(API_BASE_URL + pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  return { status: res.status, data: await res.json() };
}

async function main() {
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      API_PORT: String(API_PORT),
      USE_POSTGRES: "false",
      CORS_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000"
    },
    stdio: "pipe"
  });

  child.stdout.on("data", (d) => process.stdout.write(d));
  child.stderr.on("data", (d) => process.stderr.write(d));

  try {
    await waitForHealth(`${API_BASE_URL}/health`);

    const userA = "session-user-a";
    const userB = "session-user-b";

    const aJoin = await jpost("/queue/join", { userId: userA, modePreference: "voice_only", language: "en" });
    assert.equal(aJoin.status, 200);
    assert.equal(aJoin.data.queued, true);
    assert.equal(aJoin.data.matched, false);

    const bJoin = await jpost("/queue/join", { userId: userB, modePreference: "voice_then_video", language: "en" });
    assert.equal(bJoin.status, 200);
    assert.equal(bJoin.data.matched, true);
    assert.equal(bJoin.data.session.state, "active");
    assert.equal(bJoin.data.session.mode, "voice_then_video");

    const aStatus = await jget(`/session/status?userId=${encodeURIComponent(userA)}`);
    assert.equal(aStatus.status, 200);
    assert.equal(aStatus.data.active, true);
    assert.equal(aStatus.data.session.sessionId, bJoin.data.session.sessionId);

    const end = await jpost("/session/end", { userId: userA, reason: "test_end" });
    assert.equal(end.status, 200);
    assert.equal(end.data.ended, true);
    assert.equal(end.data.session.state, "ended");

    const bStatusAfter = await jget(`/session/status?userId=${encodeURIComponent(userB)}`);
    assert.equal(bStatusAfter.status, 200);
    assert.equal(bStatusAfter.data.active, false);

    console.log("✅ Session lifecycle API tests passed");
  } finally {
    child.kill("SIGTERM");
    await sleep(250);
    if (!child.killed) child.kill("SIGKILL");
  }
}

main().catch((err) => {
  console.error("❌ Session lifecycle API tests failed", err);
  process.exitCode = 1;
});
