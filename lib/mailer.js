// Delivers mail through Resend's HTTPS API (https://resend.com). The API key
// is read from the server environment only and never reaches the browser.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendEmail({ apiKey, from, to, replyTo, subject, text, html }) {
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: replyTo ? [replyTo] : undefined,
      subject,
      text,
      html,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend responded ${response.status}: ${detail.slice(0, 300)}`);
  }
}
