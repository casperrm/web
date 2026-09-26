import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidEmail, isValidPhone, normalizeUrl, validateSubmission } from "../public/validators.js";
import { validSubmission } from "./helpers.js";

test("accepts a complete valid submission", () => {
  const { data, errors } = validateSubmission(validSubmission());
  assert.deepEqual(errors, {});
  assert.equal(data.existingWebsite, "https://haddadbakery.com/");
  // Checkbox answers come back in schema order, not click order.
  assert.deepEqual(data.languages, ["English", "Arabic"]);
});

test("flags every missing required field", () => {
  const { errors } = validateSubmission({});
  assert.deepEqual(Object.keys(errors).sort(), [
    "businessDescription",
    "businessName",
    "email",
    "fullName",
    "mainGoal",
    "pageCount",
    "websiteType",
    "whatsapp",
  ]);
});

test("rejects whitespace-only required answers", () => {
  const { errors } = validateSubmission(validSubmission({ fullName: "   " }));
  assert.ok(errors.fullName);
});

test("rejects options that are not in the schema", () => {
  const { errors } = validateSubmission(
    validSubmission({ websiteType: "E-commerce Store", features: ["WhatsApp", "Online Shop"] }),
  );
  assert.ok(errors.websiteType);
  assert.ok(errors.features);
});

test("drops 'other' text when Other is not selected", () => {
  const { data } = validateSubmission(validSubmission({ websiteTypeOther: "sneaky" }));
  assert.equal(data.websiteTypeOther, "");
});

test("enforces max lengths", () => {
  const { errors } = validateSubmission(validSubmission({ mainGoal: "x".repeat(2001) }));
  assert.ok(errors.mainGoal);
});

test("email validation", () => {
  assert.ok(isValidEmail("a@b.co"));
  assert.ok(!isValidEmail("a@b"));
  assert.ok(!isValidEmail("a b@c.com"));
  assert.ok(!isValidEmail("<a@b.com>"));
});

test("phone validation", () => {
  assert.ok(isValidPhone("+961 3 123 456"));
  assert.ok(isValidPhone("(03) 123-456"));
  assert.ok(!isValidPhone("12345"));
  assert.ok(!isValidPhone("call me maybe"));
  assert.ok(!isValidPhone("+1234567890123456"));
});

test("URL normalization", () => {
  assert.equal(normalizeUrl("example.com"), "https://example.com/");
  assert.equal(normalizeUrl("http://www.example.com/menu"), "http://www.example.com/menu");
  assert.equal(normalizeUrl("javascript:alert(1)"), null);
  assert.equal(normalizeUrl("not a url"), null);
  assert.equal(normalizeUrl("localhost"), null);
  assert.equal(normalizeUrl("https://user:pw@example.com"), null);
});
