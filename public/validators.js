// Field validators shared by the browser and the server. The server re-runs
// every check; the browser copy exists only for fast, friendly feedback.

import { FIELDS } from "./form-schema.js";

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const PHONE_CHARS_RE = /^\+?[0-9\s\-().]+$/;

export function isValidEmail(value) {
  return value.length <= 254 && EMAIL_RE.test(value);
}

export function isValidPhone(value) {
  if (!PHONE_CHARS_RE.test(value)) return false;
  const digits = value.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
}

// Accepts "example.com" as well as "https://example.com" and returns the
// normalized http(s) URL, or null when the value is not a usable web address.
export function normalizeUrl(value) {
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname;
  if (!host.includes(".") || host.startsWith(".") || host.endsWith(".")) return null;
  return url.toString();
}

function cleanText(value, multiline) {
  if (typeof value !== "string") return "";
  // Strip control characters (keeping newlines/tabs in multi-line answers).
  const stripped = multiline
    ? value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    : value.replace(/[\u0000-\u001F\u007F]/g, " ");
  return stripped.trim();
}

// Validates a raw submission object against the schema.
// Returns { data, errors } where `data` holds only cleaned, known fields and
// `errors` maps field name -> human-readable message.
export function validateSubmission(input) {
  const source = input && typeof input === "object" ? input : {};
  const data = {};
  const errors = {};

  for (const field of FIELDS) {
    const raw = source[field.name];

    if (field.type === "checkbox") {
      const list = Array.isArray(raw) ? raw : raw == null || raw === "" ? [] : [raw];
      const picked = new Set(list.filter((v) => typeof v === "string"));
      if ([...picked].some((v) => !field.options.includes(v))) {
        errors[field.name] = "Please choose from the listed options.";
      }
      // Keep schema order so emails read consistently.
      data[field.name] = field.options.filter((option) => picked.has(option));
      if (field.required && data[field.name].length === 0) {
        errors[field.name] = "Please choose at least one option.";
      }
    } else if (field.type === "radio") {
      const value = typeof raw === "string" ? raw : "";
      if (value && !field.options.includes(value)) {
        errors[field.name] = "Please choose from the listed options.";
        data[field.name] = "";
      } else {
        data[field.name] = value;
        if (field.required && !value) errors[field.name] = "Please choose an option.";
      }
    } else {
      const value = cleanText(raw, field.type === "textarea");
      data[field.name] = value;

      if (!value) {
        if (field.required) errors[field.name] = field.requiredMessage || "This field is required.";
      } else if (field.maxLength && value.length > field.maxLength) {
        errors[field.name] = `Please keep this under ${field.maxLength} characters.`;
      } else if (field.type === "email" && !isValidEmail(value)) {
        errors[field.name] = "Please enter a valid email address, e.g. name@company.com.";
      } else if (field.type === "phone" && !isValidPhone(value)) {
        errors[field.name] =
          "Please enter a valid WhatsApp number, including the country code (e.g. +961 3 123 456).";
      } else if (field.type === "url") {
        const url = normalizeUrl(value);
        if (url) data[field.name] = url;
        else errors[field.name] = "Please enter a valid website address, e.g. www.example.com.";
      }
    }

    if (field.other) {
      const selected = Array.isArray(data[field.name])
        ? data[field.name].includes("Other")
        : data[field.name] === "Other";
      const otherValue = selected ? cleanText(source[field.other.name], false) : "";
      if (otherValue.length > field.other.maxLength) {
        errors[field.other.name] = `Please keep this under ${field.other.maxLength} characters.`;
      }
      data[field.other.name] = otherValue;
    }
  }

  return { data, errors };
}
