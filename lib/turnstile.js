// Optional Cloudflare Turnstile verification (a privacy-friendly CAPTCHA).
// Enabled only when TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are both set.

const VERIFY_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile({ secret, token, ip }) {
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const response = await fetch(VERIFY_ENDPOINT, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json();
    return result.success === true;
  } catch {
    return false;
  }
}
