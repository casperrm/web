import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp, readConfig } from "../lib/app.js";
import { validSubmission } from "./helpers.js";

const quiet = { info() {}, warn() {}, error() {} };

async function withServer(options, fn) {
  const sent = [];
  const config = { ...readConfig({ RESEND_API_KEY: "test-key" }), ...options.config };
  const app = createApp(config, {
    log: quiet,
    sendEmail: options.sendEmail || (async (msg) => void sent.push(msg)),
    verifyTurnstile: options.verifyTurnstile,
  });
  const server = http.createServer(app).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ base, sent });
  } finally {
    server.close();
  }
}

function post(base, body, headers = {}) {
  return fetch(`${base}/api/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const human = (overrides) => ({ ...validSubmission(overrides), startedAt: Date.now() - 60_000 });

test("delivers a valid submission to the configured inbox", async () => {
  await withServer({}, async ({ base, sent }) => {
    const res = await post(base, human());
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "consultingcedarpoint@gmail.com");
    assert.equal(sent[0].replyTo, "rana@haddadbakery.com");
    assert.equal(sent[0].subject, "NEW WEBSITE REQUEST — Haddad Bakery");
    assert.equal(sent[0].apiKey, "test-key");
  });
});

test("returns field errors for invalid input", async () => {
  await withServer({}, async ({ base, sent }) => {
    const res = await post(base, human({ email: "nope" }));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.errors.email);
    assert.equal(sent.length, 0);
  });
});

test("silently drops honeypot and too-fast submissions", async () => {
  await withServer({}, async ({ base, sent }) => {
    assert.equal((await post(base, { ...human(), company_website: "spam.com" })).status, 200);
    assert.equal((await post(base, { ...validSubmission(), startedAt: Date.now() })).status, 200);
    assert.equal((await post(base, validSubmission())).status, 200);
    assert.equal(sent.length, 0);
  });
});

test("rate limits by IP", async () => {
  await withServer({ config: { rateLimit: 2 } }, async ({ base }) => {
    assert.equal((await post(base, human())).status, 200);
    assert.equal((await post(base, human())).status, 200);
    assert.equal((await post(base, human())).status, 429);
  });
});

test("rejects cross-origin posts and non-JSON bodies", async () => {
  await withServer({}, async ({ base, sent }) => {
    assert.equal((await post(base, human(), { Origin: "https://evil.example" })).status, 403);
    const form = await fetch(`${base}/api/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "a=b",
    });
    assert.equal(form.status, 415);
    assert.equal((await post(base, "{not json")).status, 400);
    assert.equal(sent.length, 0);
  });
});

test("rejects oversized bodies", async () => {
  await withServer({}, async ({ base }) => {
    const res = await post(base, { ...human(), mainGoal: "x".repeat(40_000) });
    assert.equal(res.status, 413);
  });
});

test("reports delivery failure without leaking details", async () => {
  const failing = async () => {
    throw new Error("Resend responded 401: secret detail");
  };
  await withServer({ sendEmail: failing }, async ({ base }) => {
    const res = await post(base, human());
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.ok(!JSON.stringify(body).includes("secret"));
  });
});

test("fails closed when no API key is configured", async () => {
  await withServer({ config: { resendApiKey: "" } }, async ({ base, sent }) => {
    assert.equal((await post(base, human())).status, 503);
    assert.equal(sent.length, 0);
  });
});

test("requires a valid CAPTCHA when Turnstile is configured", async () => {
  const config = { turnstileSiteKey: "site", turnstileSecretKey: "secret" };
  const verifyTurnstile = async ({ token }) => token === "good";
  await withServer({ config, verifyTurnstile }, async ({ base, sent }) => {
    const cfg = await (await fetch(`${base}/api/config`)).json();
    assert.equal(cfg.turnstileSiteKey, "site");
    assert.equal((await post(base, { ...human(), turnstileToken: "bad" })).status, 400);
    assert.equal((await post(base, { ...human(), turnstileToken: "good" })).status, 200);
    assert.equal(sent.length, 1);
  });
});

test("serves the page with security headers and blocks traversal", async () => {
  await withServer({}, async ({ base }) => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal((await fetch(`${base}/form-schema.js`)).status, 200);
    assert.equal((await fetch(`${base}/..%2Fserver.js`)).status, 404);
    assert.equal((await fetch(`${base}/..%2F.env.example`)).status, 404);
    assert.equal((await fetch(`${base}/api/config`)).status, 200);
    const cfg = await (await fetch(`${base}/api/config`)).json();
    assert.equal(cfg.turnstileSiteKey, null);
  });
});
