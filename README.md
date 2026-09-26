# Cedar Point Media — Website Request Intake

A public, single-page intake form for **Web Design & Development** clients.
It has **no npm dependencies** and needs only Node 18.18+.

When someone submits the form, an email goes to `consultingcedarpoint@gmail.com`
with the subject `NEW WEBSITE REQUEST — [Business Name]`. The email lists every
question and answer, grouped and numbered, and ends with the
`--- CEDAR POINT INTERNAL REVIEW ---` prompt. The email's Reply-To is the
client's address, so pressing reply goes straight to them.

## Structure

```
./
  server.js              # entry point (node server.js)
  lib/app.js             # HTTP handler: static files, /api/submit, security headers
  lib/email.js           # subject + plain-text/HTML email, internal review block
  lib/mailer.js          # Resend HTTPS API delivery (server-side only)
  lib/rate-limit.js      # per-IP rate limit
  lib/turnstile.js       # optional Cloudflare Turnstile verification
  public/index.html      # the page
  public/styles.css
  public/app.js          # client-side validation + submit/success/error states
  public/form-schema.js  # every question & option — shared by browser and server
  public/validators.js   # validation — shared by browser and server
  public/assets/         # put the original logo here as logo.png
  test/                  # node --test
```

## Logo

The original Cedar Point Media logo file isn't in the repository yet. Save it,
unmodified, as **`public/assets/logo.png`** and it appears above the header.
Until then the page shows the text header by itself. (For an SVG, change the
`src` in `index.html`.)

## Email delivery (Resend)

Emails are sent through [Resend](https://resend.com) from the server. The API
key sits in the server environment and is never shipped to the browser. The
recipient address is also kept server-side.

1. Create a Resend account and an API key.
2. **Quick start:** if the Resend account belongs to
   `consultingcedarpoint@gmail.com`, the default sender
   `onboarding@resend.dev` works right away.
3. **Production:** verify your own domain in Resend and set
   `MAIL_FROM="Cedar Point Media <requests@yourdomain.com>"`.

All settings are listed in `.env.example`.

## Spam protection

- Honeypot field that bots fill in and people never see.
- Time trap: forms submitted less than 3 seconds after the page loads are
  discarded.
- Honeypot and time-trap hits get a normal-looking success response, so bots
  learn nothing.
- Per-IP rate limit (5 per hour by default). Set `TRUST_PROXY=1` behind a
  proxy.
- Same-origin check, JSON-only requests, 32 KB body limit.
- Optional **Cloudflare Turnstile** CAPTCHA: set `TURNSTILE_SITE_KEY` and
  `TURNSTILE_SECRET_KEY`.

The server also validates every field against the schema (required answers,
allowed options, email, phone, URL, lengths), escapes all user input in the
HTML email, and sends a strict Content-Security-Policy.

## Run locally

```bash
npm run dev     # MAIL_DRY_RUN=1: prints the email to the console instead of sending
npm test
```

## Deploy (e.g. Render)

Create a **Web Service** from this repository with start command
`npm start`; no build step is needed. Then set `RESEND_API_KEY`, `MAIL_FROM`
and `TRUST_PROXY=1`. The health check is at `/healthz`.
