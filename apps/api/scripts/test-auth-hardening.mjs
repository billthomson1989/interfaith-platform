import { setTimeout as sleep } from "node:timers/promises";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const API_PORT = Number(process.env.TEST_API_PORT || 4400);
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
    env: {
      ...process.env,
      API_PORT: String(API_PORT),
      USE_POSTGRES: "false",
      NODE_ENV: "production"
    },
    stdio: "pipe"
  });

  child.stdout.on("data", (d) => process.stdout.write(d));
  child.stderr.on("data", (d) => process.stderr.write(d));

  try {
    await waitForHealth(`${API_BASE_URL}/health`);

    const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "auth-hardening-user" })
    });
    assert.equal(loginRes.status, 200);

    const setCookie = loginRes.headers.get("set-cookie") || "";
    assert.ok(setCookie.includes("HttpOnly"));
    assert.ok(setCookie.includes("SameSite=Lax"));
    assert.ok(setCookie.includes("Secure"));

    const cookieHeader = setCookie.split(";")[0];

    const meRes = await fetch(`${API_BASE_URL}/me`, { headers: { cookie: cookieHeader } });
    assert.equal(meRes.status, 200);
    const me = await meRes.json();
    assert.equal(me.ok, true);
    assert.equal(me.userId, "auth-hardening-user");

    let got429 = false;
    for (let i = 0; i < 20; i += 1) {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: `user-${i}` })
      });
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.equal(got429, true);

    console.log("✅ Auth hardening tests passed");
  } finally {
    child.kill("SIGTERM");
    await sleep(250);
    if (!child.killed) child.kill("SIGKILL");
  }
}

main().catch((err) => {
  console.error("❌ Auth hardening tests failed", err);
  process.exitCode = 1;
});
