import { setTimeout as sleep } from "node:timers/promises";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";

const API_PORT = Number(process.env.SMOKE_API_PORT || 4100);
const WEB_PORT = Number(process.env.SMOKE_WEB_PORT || 3100);
const API_BASE_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_BASE_URL = `http://127.0.0.1:${WEB_PORT}`;

function resolveBrowserExecutable() {
  if (process.env.SMOKE_BROWSER_PATH && fs.existsSync(process.env.SMOKE_BROWSER_PATH)) {
    return process.env.SMOKE_BROWSER_PATH;
  }

  const candidates = process.platform === "win32"
    ? [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        `${process.env.LOCALAPPDATA || ""}/Google/Chrome/Application/chrome.exe`,
        `${process.env.LOCALAPPDATA || ""}/BraveSoftware/Brave-Browser/Application/brave.exe`
      ]
    : process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
        ]
      : [
          "/usr/bin/google-chrome",
          "/usr/bin/chromium-browser",
          "/usr/bin/chromium",
          "/usr/bin/brave-browser"
        ];

  return candidates.find((p) => fs.existsSync(p));
}

async function waitForHealth(url, name, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`${name} healthcheck timed out: ${url}`);
}

function parseJsonPre(text) {
  return JSON.parse(text);
}

async function waitForJson(locator, predicate = () => true, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const text = await locator.innerText();
    if (text.trim().startsWith("{")) {
      const parsed = JSON.parse(text);
      if (predicate(parsed)) return parsed;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for expected JSON in ${await locator.innerText()}`);
}

async function main() {
  const browserExecutable = resolveBrowserExecutable();
  if (!browserExecutable) {
    throw new Error("No Chromium-based browser found. Set SMOKE_BROWSER_PATH to chrome/brave executable.");
  }

  process.env.API_PORT = String(API_PORT);
  process.env.APP_PORT = String(WEB_PORT);
  process.env.API_BASE_URL = API_BASE_URL;

  await import("../../api/src/server.js");
  await import("../src/server.js");

  await waitForHealth(`${API_BASE_URL}/health`, "api");
  await waitForHealth(`${WEB_BASE_URL}/health`, "web");

  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(WEB_BASE_URL, { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Login" }).click();
  const authLogin = await waitForJson(page.locator("#authOut"));
  assert.equal(authLogin.ok, true);

  await page.getByRole("button", { name: "Who am I?" }).click();
  const authMe = await waitForJson(page.locator("#authOut"));
  assert.equal(authMe.ok, true);

  await page.getByRole("button", { name: "Join queue" }).click();
  const joined = await waitForJson(page.locator("#queueOut"), (j) => Boolean(j.queueId));
  assert.equal(joined.ok, true);

  await page.getByRole("button", { name: "Check status" }).click();
  const status = await waitForJson(page.locator("#queueOut"), (j) => j.queued === true);
  assert.equal(status.queued, true);

  await page.getByRole("button", { name: "Leave queue" }).click();
  const left = await waitForJson(page.locator("#queueOut"), (j) => typeof j.removed === "boolean");
  assert.equal(left.removed, true);

  await page.locator("#targetUserId").fill("other-user");
  await page.locator("#reportNotes").fill("smoke test");
  await page.getByRole("button", { name: "Submit report" }).click();
  const report = await waitForJson(page.locator("#reportOut"));
  assert.equal(report.ok, true);

  await page.getByRole("button", { name: "Search" }).click();
  const citationText = await page.locator("#citationOut").innerText();
  assert.ok(citationText.length > 0);

  await browser.close();
  console.log("✅ Frontend smoke e2e passed");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Smoke test failed", error);
    process.exit(1);
  });
