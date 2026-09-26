import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEmail, INTERNAL_REVIEW } from "../lib/email.js";
import { FIELDS } from "../public/form-schema.js";
import { validateSubmission } from "../public/validators.js";
import { validSubmission } from "./helpers.js";

const { data } = validateSubmission(validSubmission());
const email = buildEmail(data, { submittedAt: new Date("2026-09-26T12:00:00Z") });

test("subject names the business", () => {
  assert.equal(email.subject, "NEW WEBSITE REQUEST — Haddad Bakery");
});

test("subject cannot carry header injection", () => {
  const { data: d } = validateSubmission(validSubmission({ businessName: "Evil\r\nBcc: x@y.com" }));
  assert.ok(!/[\r\n]/.test(buildEmail(d).subject));
});

test("includes every question, numbered, in both formats", () => {
  FIELDS.forEach((field, index) => {
    assert.ok(email.text.includes(`${index + 1}. ${field.label}`), field.label);
  });
  assert.ok(email.text.includes("WhatsApp, Google Maps, Other — Online ordering"));
  assert.ok(email.text.includes("Not provided"));
});

test("ends with the internal review block", () => {
  assert.ok(email.text.trimEnd().endsWith(INTERNAL_REVIEW));
  assert.ok(email.html.includes("--- CEDAR POINT INTERNAL REVIEW ---"));
});

test("escapes user input in HTML", () => {
  const { data: d } = validateSubmission(validSubmission({ mainGoal: "<script>alert(1)</script>" }));
  const { html } = buildEmail(d);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("never contains a price", () => {
  const body = email.text.replace(INTERNAL_REVIEW, "");
  assert.ok(!body.includes("$"));
});
