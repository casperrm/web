import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FIELDS, HONEYPOT_FIELD } from "../public/form-schema.js";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

test("the page markup matches the schema", () => {
  for (const field of FIELDS) {
    if (field.options) {
      for (const option of field.options) {
        assert.ok(
          html.includes(`name="${field.name}" value="${option}"`),
          `${field.name} is missing option ${option}`,
        );
      }
    } else {
      assert.ok(html.includes(`name="${field.name}"`), `missing input ${field.name}`);
    }
    if (field.other) assert.ok(html.includes(`name="${field.other.name}"`));
    assert.ok(html.includes(`id="${field.name}-error"`), `missing error slot for ${field.name}`);
  }
  assert.ok(html.includes(`name="${HONEYPOT_FIELD}"`));
});

test("page has the required copy and no prices", () => {
  assert.ok(html.includes("REQUEST MY QUOTE"));
  assert.ok(html.includes("CEDAR POINT MEDIA"));
  assert.ok(html.includes("Your project request has been received."));
  assert.ok(!html.includes("$"));
  assert.ok(!html.includes("consultingcedarpoint@gmail.com"), "recipient must stay server-side");
});
