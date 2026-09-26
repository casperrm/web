import { FIELDS, HONEYPOT_FIELD, STARTED_AT_FIELD, TURNSTILE_FIELD } from "./form-schema.js";
import { validateSubmission } from "./validators.js";

const form = document.getElementById("intake-form");
const formError = document.getElementById("form-error");
const submitButton = document.getElementById("submit-button");
const success = document.getElementById("success");
const captcha = document.getElementById("captcha");
const startedAt = Date.now();
let turnstileWidget = null;

// ---------- Logo: reveal only once the original file has loaded ----------

const logo = document.querySelector("[data-logo]");
if (logo) {
  const reveal = () => {
    if (logo.naturalWidth > 0) logo.hidden = false;
  };
  if (logo.complete) reveal();
  else logo.addEventListener("load", reveal, { once: true });
}

document.querySelector("[data-year]").textContent = String(new Date().getFullYear());

// ---------- "Other — please specify" inputs ----------

function syncOtherInputs() {
  for (const wrapper of form.querySelectorAll("[data-other-for]")) {
    const name = wrapper.dataset.otherFor;
    const selected = form.querySelector(`input[name="${name}"][value="Other"]`).checked;
    wrapper.hidden = !selected;
  }
}
form.addEventListener("change", syncOtherInputs);

// ---------- Reading & validating ----------

function readForm() {
  const values = {};
  for (const field of FIELDS) {
    if (field.type === "checkbox") {
      values[field.name] = [...form.querySelectorAll(`input[name="${field.name}"]:checked`)].map((i) => i.value);
    } else if (field.type === "radio") {
      values[field.name] = form.querySelector(`input[name="${field.name}"]:checked`)?.value || "";
    } else {
      values[field.name] = form.elements[field.name].value;
    }
    if (field.other) values[field.other.name] = form.elements[field.other.name].value;
  }
  return values;
}

// The element that carries aria-invalid / receives focus for a field.
function controlFor(name) {
  return form.querySelector(`[data-group="${name}"]`) || form.elements[name];
}

function focusTarget(name) {
  const group = form.querySelector(`[data-group="${name}"]`);
  return group ? group.querySelector("input") : form.elements[name];
}

function setFieldError(name, message) {
  const control = controlFor(name);
  const error = document.getElementById(`${name}-error`);
  if (!control || !error) return;
  if (message) {
    control.setAttribute("aria-invalid", "true");
    error.textContent = message;
    error.hidden = false;
  } else {
    control.removeAttribute("aria-invalid");
    error.textContent = "";
    error.hidden = true;
  }
}

function allFieldNames() {
  return FIELDS.flatMap((field) => (field.other ? [field.name, field.other.name] : [field.name]));
}

function showErrors(errors) {
  for (const name of allFieldNames()) setFieldError(name, errors[name]);
  const first = allFieldNames().find((name) => errors[name]);
  if (first) {
    const target = focusTarget(first);
    target?.focus({ preventScroll: true });
    controlFor(first)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// Re-validate a field as the person fixes it, but only once it has been
// flagged — no nagging while they are still typing for the first time.
function revalidate(name) {
  const control = controlFor(name);
  if (control?.getAttribute("aria-invalid") !== "true") return;
  const { errors } = validateSubmission(readForm());
  setFieldError(name, errors[name]);
}

form.addEventListener("input", (event) => revalidate(event.target.name));
form.addEventListener("change", (event) => revalidate(event.target.name));
form.addEventListener(
  "blur",
  (event) => {
    const name = event.target.name;
    if (!name || !event.target.value) return;
    const field = FIELDS.find((f) => f.name === name);
    if (!field || !["email", "phone", "url"].includes(field.type)) return;
    const { errors } = validateSubmission(readForm());
    setFieldError(name, errors[name]);
  },
  true,
);

// ---------- Form-level status ----------

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
  formError.focus({ preventScroll: true });
  formError.scrollIntoView({ behavior: "smooth", block: "center" });
}

function setBusy(busy) {
  submitButton.disabled = busy;
  submitButton.setAttribute("aria-busy", String(busy));
  submitButton.querySelector(".button__label").textContent = busy ? "SENDING…" : "REQUEST MY QUOTE";
}

// ---------- Optional CAPTCHA (Cloudflare Turnstile) ----------

async function setupCaptcha() {
  try {
    const response = await fetch("api/config", { headers: { Accept: "application/json" } });
    const { turnstileSiteKey } = await response.json();
    if (!turnstileSiteKey) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    captcha.hidden = false;
    turnstileWidget = window.turnstile.render(captcha, { sitekey: turnstileSiteKey, theme: "dark" });
  } catch {
    // Server-side checks still apply; the server rejects if CAPTCHA is required.
  }
}
setupCaptcha();

// ---------- Submit ----------

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.hidden = true;

  const values = readForm();
  const { errors } = validateSubmission(values);
  if (Object.keys(errors).length) {
    showErrors(errors);
    showFormError("Please complete the highlighted fields.");
    return;
  }
  showErrors({});

  const payload = {
    ...values,
    [HONEYPOT_FIELD]: form.elements[HONEYPOT_FIELD].value,
    [STARTED_AT_FIELD]: startedAt,
  };
  if (turnstileWidget !== null) {
    payload[TURNSTILE_FIELD] = window.turnstile.getResponse(turnstileWidget) || "";
  }

  setBusy(true);
  try {
    const response = await fetch("api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));

    if (response.ok && result.ok) {
      form.hidden = true;
      success.hidden = false;
      success.focus({ preventScroll: true });
      success.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (result.errors) showErrors(result.errors);
    showFormError(
      result.message
        ? `${result.message} Your answers are still here — please try again.`
        : "Something went wrong sending your request. Your answers are still here — please try again.",
    );
    if (turnstileWidget !== null) window.turnstile.reset(turnstileWidget);
  } catch {
    showFormError("We couldn't reach our server. Please check your connection and try again.");
  } finally {
    setBusy(false);
  }
});
