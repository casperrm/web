import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HONEYPOT_FIELD, STARTED_AT_FIELD, TURNSTILE_FIELD } from "../public/form-schema.js";
import { validateSubmission } from "../public/validators.js";
import { buildEmail } from "./email.js";
import { sendEmail as resendSend } from "./mailer.js";
import { createRateLimiter } from "./rate-limit.js";
import { verifyTurnstile as turnstileVerify } from "./turnstile.js";

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const MAX_BODY_BYTES = 32 * 1024;
// A person can't read and complete this form in under a few seconds; bots can.
const MIN_FILL_MS = 3_000;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

export function readConfig(env = process.env) {
  return {
    resendApiKey: env.RESEND_API_KEY || "",
    mailFrom: env.MAIL_FROM || "Cedar Point Media <onboarding@resend.dev>",
    mailTo: env.MAIL_TO || "consultingcedarpoint@gmail.com",
    dryRun: env.MAIL_DRY_RUN === "1",
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || "",
    turnstileSecretKey: env.TURNSTILE_SECRET_KEY || "",
    trustProxy: env.TRUST_PROXY === "1",
    rateLimit: Number(env.RATE_LIMIT_PER_HOUR) || 5,
  };
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function securityHeaders(turnstile) {
  const cf = turnstile ? " https://challenges.cloudflare.com" : "";
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      `script-src 'self'${cf}`,
      `frame-src${cf || " 'none'"}`,
      `connect-src 'self'`,
      "style-src 'self' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' data:",
      "form-action 'self'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "object-src 'none'",
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}

function sendJson(res, status, body, headers) {
  res.writeHead(status, {
    ...headers,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function clientIp(req, trustProxy) {
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

async function readJsonBody(req) {
  const type = req.headers["content-type"] || "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Unsupported content type.");
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Your request is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
}

// Builds the HTTP request handler. Delivery and CAPTCHA verification are
// injectable so tests never touch the network.
export function createApp(config, deps = {}) {
  const sendEmail = deps.sendEmail || resendSend;
  const verifyTurnstile = deps.verifyTurnstile || turnstileVerify;
  const log = deps.log || console;
  const turnstileEnabled = Boolean(config.turnstileSiteKey && config.turnstileSecretKey);
  const headers = securityHeaders(turnstileEnabled);
  const isAllowed = createRateLimiter({ limit: config.rateLimit, windowMs: 60 * 60 * 1000 });

  async function handleSubmit(req, res) {
    // Reject cross-site posts: the form only ever submits from this origin.
    const origin = req.headers.origin;
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {}
      if (originHost !== req.headers.host) throw new HttpError(403, "Forbidden.");
    }

    const body = await readJsonBody(req);
    const ip = clientIp(req, config.trustProxy);

    if (!isAllowed(ip)) {
      throw new HttpError(429, "Too many requests. Please try again later or contact us on WhatsApp.");
    }

    // Bots that fill the hidden field or submit instantly get a normal-looking
    // success response, so there is nothing for them to learn or retry.
    const startedAt = Number(body?.[STARTED_AT_FIELD]);
    const tooFast = !Number.isFinite(startedAt) || Date.now() - startedAt < MIN_FILL_MS;
    if (body?.[HONEYPOT_FIELD] || tooFast) {
      log.warn(`[intake] spam check tripped (${tooFast ? "timing" : "honeypot"}) from ${ip}`);
      return sendJson(res, 200, { ok: true }, headers);
    }

    const { data, errors } = validateSubmission(body);
    if (Object.keys(errors).length) {
      return sendJson(res, 400, { ok: false, message: "Please check the highlighted fields.", errors }, headers);
    }

    if (turnstileEnabled) {
      const human = await verifyTurnstile({
        secret: config.turnstileSecretKey,
        token: body[TURNSTILE_FIELD],
        ip,
      });
      if (!human) throw new HttpError(400, "We couldn't verify you're human. Please try the check again.");
    }

    const email = buildEmail(data);

    if (config.dryRun) {
      log.info(`[intake] MAIL_DRY_RUN — not sending.\nSubject: ${email.subject}\n\n${email.text}`);
      return sendJson(res, 200, { ok: true }, headers);
    }
    if (!config.resendApiKey) {
      log.error("[intake] RESEND_API_KEY is not set; cannot deliver submission.");
      throw new HttpError(503, "Our form is temporarily unavailable.");
    }

    try {
      await sendEmail({
        apiKey: config.resendApiKey,
        from: config.mailFrom,
        to: config.mailTo,
        replyTo: data.email,
        ...email,
      });
    } catch (error) {
      log.error("[intake] email delivery failed:", error);
      throw new HttpError(502, "We couldn't send your request just now.");
    }

    return sendJson(res, 200, { ok: true }, headers);
  }

  async function serveStatic(req, res, pathname) {
    const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
    const filePath = path.resolve(PUBLIC_DIR, relative);
    const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()];
    if (!filePath.startsWith(PUBLIC_DIR + path.sep) || !type) {
      throw new HttpError(404, "Not found.");
    }
    let content;
    try {
      content = await readFile(filePath);
    } catch {
      throw new HttpError(404, "Not found.");
    }
    res.writeHead(200, {
      ...headers,
      "Content-Type": type,
      "Cache-Control": type.startsWith("text/html") ? "no-cache" : "public, max-age=3600",
    });
    res.end(req.method === "HEAD" ? undefined : content);
  }

  return async function handler(req, res) {
    const { pathname } = new URL(req.url || "/", "http://localhost");
    try {
      if (pathname === "/api/submit") {
        if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
        return await handleSubmit(req, res);
      }
      if (pathname === "/api/config") {
        return sendJson(res, 200, { turnstileSiteKey: turnstileEnabled ? config.turnstileSiteKey : null }, headers);
      }
      if (pathname === "/healthz") {
        return sendJson(res, 200, { ok: true }, headers);
      }
      if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "Method not allowed.");
      return await serveStatic(req, res, pathname);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) log.error("[intake] unexpected error:", error);
      if (res.headersSent) return res.end();
      const message = error instanceof HttpError ? error.message : "Something went wrong.";
      if (pathname.startsWith("/api/")) {
        return sendJson(res, status, { ok: false, message }, headers);
      }
      res.writeHead(status, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
      res.end(message);
    }
  };
}
