import { FIELDS, SECTIONS } from "../public/form-schema.js";

export const INTERNAL_REVIEW = `--- CEDAR POINT INTERNAL REVIEW ---

Analyze this Cedar Point Media website request.

1. Recommend the appropriate project price:
$300 / $350 / $450 / $550 / $750 / $850 / $900+

2. Explain why this price is appropriate.

3. List exactly what should be included in the project.

4. Identify anything that should cost extra.

5. Keep domain, hosting and paid third-party services separate.

6. Estimate the project's complexity and expected workload.

7. Prepare a professional client-facing quotation/message that Cedar Point Media can send directly to the client.

Do not ask Cedar Point Media to repeat information already provided in this request.`;

const NOT_PROVIDED = "Not provided";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Human-readable answer for one question, folding any "Other — please
// specify" text into the answer it belongs to.
function formatAnswer(field, data) {
  const value = data[field.name];
  const other = field.other ? data[field.other.name] : "";
  const withOther = (option) => (option === "Other" && other ? `Other — ${other}` : option);

  if (Array.isArray(value)) {
    return value.length ? value.map(withOther).join(", ") : NOT_PROVIDED;
  }
  return value ? withOther(value) : NOT_PROVIDED;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date) + " UTC";
}

export function buildSubject(data) {
  // Header-safe: collapse whitespace so user input can't inject header lines.
  const business = data.businessName.replace(/\s+/g, " ").trim().slice(0, 120);
  return `NEW WEBSITE REQUEST — ${business}`;
}

// Builds the notification email for a validated submission.
export function buildEmail(data, { submittedAt = new Date() } = {}) {
  const questions = FIELDS.map((field, index) => ({
    number: index + 1,
    field,
    answer: formatAnswer(field, data),
  }));
  const when = formatDate(submittedAt);

  const textParts = [
    `NEW WEBSITE REQUEST — ${data.businessName}`,
    `Service: Web Design & Development`,
    `Submitted: ${when}`,
    "",
  ];
  for (const section of SECTIONS) {
    textParts.push(section.title.toUpperCase(), "-".repeat(section.title.length));
    for (const q of questions.filter((item) => item.field.section === section.id)) {
      const indented = q.answer.split("\n").map((line) => `   ${line}`).join("\n");
      textParts.push(`${q.number}. ${q.field.label}`, indented, "");
    }
  }
  textParts.push("", INTERNAL_REVIEW, "");
  const text = textParts.join("\n");

  const sectionHtml = SECTIONS.map((section) => {
    const rows = questions
      .filter((item) => item.field.section === section.id)
      .map(
        (q) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
            <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">${q.number}. ${escapeHtml(q.field.label)}</div>
            <div style="font-size:15px;color:${q.answer === NOT_PROVIDED ? "#9ca3af" : "#111827"};white-space:pre-wrap;">${escapeHtml(q.answer)}</div>
          </td>
        </tr>`,
      )
      .join("");
    return `
      <h2 style="margin:28px 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#2b52ff;">${escapeHtml(section.title)}</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}
      </table>`;
  }).join("");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <div style="background:#0a0e1a;padding:24px 28px;">
        <div style="font-size:12px;letter-spacing:.2em;color:#8fa6ff;">CEDAR POINT MEDIA</div>
        <div style="font-size:20px;font-weight:600;color:#ffffff;margin-top:6px;">New website request — ${escapeHtml(data.businessName)}</div>
        <div style="font-size:13px;color:#9ca3af;margin-top:6px;">Web Design &amp; Development · ${escapeHtml(when)}</div>
      </div>
      <div style="padding:4px 28px 28px;">${sectionHtml}
        <pre style="margin:32px 0 0;padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.55;color:#111827;white-space:pre-wrap;">${escapeHtml(INTERNAL_REVIEW)}</pre>
      </div>
    </div>
  </body>
</html>`;

  return { subject: buildSubject(data), text, html };
}
