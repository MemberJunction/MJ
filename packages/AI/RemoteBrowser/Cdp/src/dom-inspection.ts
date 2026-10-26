/**
 * @fileoverview Structured DOM perception (`inspect`), verified form filling (`fill`), ref/text click
 * resolution, and URL normalization for {@link CdpRemoteBrowserSession}.
 *
 * These helpers enable turn-based text LLMs to perceive and interact with live web pages deterministically
 * over the same CDP session that powers the live screencast and human takeover viewer:
 * - `NormalizeNavigableUrl` converts bare domains (`example.com`, `localhost:3000`) into valid URLs.
 * - `InspectPageDom` extracts visible text, form fields (`field-1`, `field-2`, ...), interactive actions
 *   (`action-1`, `action-2`, ...), and links, while redacting sensitive inputs (`password`, CVV, OTP, SSN).
 * - `FillPageFields` populates multiple form fields in a single round-trip using native prototype value
 *   setters (React/Angular/Vue compatible), dispatches `input`/`change`/`blur` events, and verifies values.
 * - `ClickPageByRefOrText` clicks an element by `Ref` or visible `Text` while guarding against
 *   autonomous clicks on destructive/submit/credential buttons.
 *
 * @module @memberjunction/remote-browser-cdp
 */

import { PlaywrightBrowserAdapter } from '@memberjunction/computer-use';
import {
  RemoteBrowserActionObservation,
  RemoteBrowserActionResult,
  RemoteBrowserClickAction,
  RemoteBrowserFieldObservation,
  RemoteBrowserFilledFieldResult,
  RemoteBrowserFillFieldInput,
  RemoteBrowserLinkObservation,
  RemoteBrowserPageObservation,
} from '@memberjunction/remote-browser-base';

/** Timeout bound (ms) for in-page DOM evaluation probes. */
const DOM_EVALUATE_TIMEOUT_MS = 8000;

/**
 * Minimal structural interface for the Playwright `Page.evaluate` surface used by DOM inspection/fill.
 * Defined self-contained here so `@memberjunction/remote-browser-cdp` needs no direct `playwright` dependency.
 */
export interface IPlaywrightEvaluatablePage {
  evaluate<R>(pageFunction: () => R | Promise<R>): Promise<R>;
  evaluate<R, Arg>(pageFunction: (arg: Arg) => R | Promise<R>, arg: Arg): Promise<R>;
}

/**
 * Optional test-fake hooks that a {@link PlaywrightBrowserAdapter} double can implement to script
 * `inspect`, `fill`, and ref/text `click` outcomes without a live Playwright `Page`.
 */
export interface IDomInspectableAdapterHooks {
  /** Optional override for {@link InspectPageDom} used in unit tests. */
  InspectPageOverride?: (observationId: string) => Promise<RemoteBrowserPageObservation>;
  /** Optional override for {@link FillPageFields} used in unit tests. */
  FillFieldsOverride?: (
    values: ReadonlyArray<RemoteBrowserFillFieldInput>,
    observationId: string,
  ) => Promise<RemoteBrowserActionResult>;
  /** Optional override for {@link ClickPageByRefOrText} used in unit tests. */
  ClickByRefOrTextOverride?: (
    action: RemoteBrowserClickAction,
    observationId: string,
  ) => Promise<RemoteBrowserActionResult>;
}

/**
 * Normalizes a user- or model-supplied URL string so bare domains (e.g. `'example.com'`,
 * `'httpbin.org/forms/post'`, `'localhost:4200'`) become valid navigable URLs.
 *
 * @param rawUrl The raw URL or domain string.
 * @returns A normalized URL carrying an explicit scheme.
 */
export function NormalizeNavigableUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (/^(https?:\/\/|about:|data:|file:|blob:|chrome:)/i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}

/**
 * Extracts the underlying Playwright page from a {@link PlaywrightBrowserAdapter} when connected
 * to a real browser, or `null` when running against a test fake that does not launch Playwright.
 */
function getAdapterPage(adapter: PlaywrightBrowserAdapter): IPlaywrightEvaluatablePage | null {
  const candidate = (adapter as unknown as { page?: IPlaywrightEvaluatablePage | null }).page;
  return candidate ?? null;
}

/**
 * Runs an async operation bounded by `timeoutMs`, returning `null` if the timer expires first.
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const expiry = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    return await Promise.race([promise, expiry]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Raw payload returned by the in-page DOM inspection script.
 */
interface RawDomInspectionPayload {
  url: string;
  title: string;
  text: string;
  fields: RemoteBrowserFieldObservation[];
  actions: RemoteBrowserActionObservation[];
  links: RemoteBrowserLinkObservation[];
}

/**
 * Self-contained browser-context function executed via `page.evaluate` to stamp stable `data-mj-browser-ref`
 * attributes and extract visible text, form fields, interactive controls, and links.
 */
function inPageInspectDom(): RawDomInspectionPayload {
  const PROTECTED_PATTERN =
    /password|passcode|pin\b|otp|one[-_\s]?time|verification\s*code|cvv|cvc|csc|security\s*code|card\s*number|credit\s*card|debit\s*card|ssn|social\s*security|tax\s*id|routing\s*number|bank\s*account/i;
  const DESTRUCTIVE_ACTION_PATTERN =
    /\b(submit|purchase|buy\s+now|pay\b|place\s+order|checkout|delete|remove|destroy|cancel\s+account|close\s+account|confirm\s+order|authorize|wire\s+transfer|sign\s+in|log\s+in)\b/i;

  const isVisible = (el: Element): boolean => {
    const htmlEl = el as HTMLElement;
    if (typeof htmlEl.checkVisibility === 'function') {
      if (!htmlEl.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) {
        return false;
      }
    } else {
      const style = window.getComputedStyle(htmlEl);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
        return false;
      }
    }
    const rect = htmlEl.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const cleanText = (val: string | null | undefined, maxLen: number = 160): string =>
    (val ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLen);

  const resolveFieldLabel = (el: HTMLElement): string => {
    const ariaLabel = cleanText(el.getAttribute('aria-label'));
    if (ariaLabel) {
      return ariaLabel;
    }
    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const joined = ariaLabelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
      const cleaned = cleanText(joined);
      if (cleaned) {
        return cleaned;
      }
    }
    if (el.id) {
      try {
        const explicitLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (explicitLabel) {
          const cleaned = cleanText(explicitLabel.textContent);
          if (cleaned) {
            return cleaned;
          }
        }
      } catch {
        // Ignore selector escape issues
      }
    }
    const wrappingLabel = el.closest('label');
    if (wrappingLabel) {
      const clone = wrappingLabel.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('input, select, textarea, button').forEach((n) => n.remove());
      const cleaned = cleanText(clone.textContent);
      if (cleaned) {
        return cleaned;
      }
    }
    const placeholder = cleanText(el.getAttribute('placeholder'));
    if (placeholder) {
      return placeholder;
    }
    const nameAttr = cleanText(el.getAttribute('name'));
    if (nameAttr) {
      return nameAttr;
    }
    const titleAttr = cleanText(el.getAttribute('title'));
    if (titleAttr) {
      return titleAttr;
    }
    return cleanText(el.id) || el.tagName.toLowerCase();
  };

  const fields: RemoteBrowserFieldObservation[] = [];
  let fieldCounter = 0;

  const formControls = Array.from(
    document.querySelectorAll('input, select, textarea'),
  ) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

  for (const control of formControls) {
    if (!isVisible(control)) {
      continue;
    }
    const tag = control.tagName.toLowerCase();
    const inputType = tag === 'input' ? (control.getAttribute('type') || 'text').toLowerCase() : tag;
    if (inputType === 'hidden' || inputType === 'submit' || inputType === 'button' || inputType === 'reset' || inputType === 'image') {
      continue;
    }

    fieldCounter += 1;
    const ref = `field-${fieldCounter}`;
    control.setAttribute('data-mj-browser-ref', ref);

    let label = resolveFieldLabel(control);
    if (inputType === 'radio' || inputType === 'checkbox') {
      const valAttr = cleanText((control as HTMLInputElement).value);
      if (valAttr && valAttr.toLowerCase() !== 'on' && !label.toLowerCase().includes(valAttr.toLowerCase())) {
        label = `${label} (${valAttr})`;
      }
    }

    const nameOrId = cleanText(control.getAttribute('name') || control.id || '', 80) || undefined;
    const autocomplete = cleanText(control.getAttribute('autocomplete') || '', 80);
    const descriptor = `${label} ${nameOrId ?? ''} ${autocomplete} ${inputType}`;
    const isProtected = inputType === 'password' || PROTECTED_PATTERN.test(descriptor);
    const isDisabledOrReadOnly =
      control.disabled ||
      control.getAttribute('aria-disabled') === 'true' ||
      ('readOnly' in control && Boolean((control as HTMLInputElement | HTMLTextAreaElement).readOnly));

    const observation: RemoteBrowserFieldObservation = {
      Ref: ref,
      Label: label,
      ...(nameOrId ? { Name: nameOrId } : {}),
      Kind: inputType,
      Required: Boolean(control.required || control.getAttribute('aria-required') === 'true'),
      Writable: !isProtected && !isDisabledOrReadOnly,
      ...(isProtected ? { Redacted: true } : {}),
    };

    if (inputType === 'checkbox' || inputType === 'radio') {
      observation.Checked = Boolean((control as HTMLInputElement).checked);
      observation.Value = (control as HTMLInputElement).value || (observation.Checked ? 'true' : 'false');
    } else if (tag === 'select') {
      const selectEl = control as HTMLSelectElement;
      observation.Value = isProtected ? '[REDACTED]' : selectEl.value;
      observation.Options = Array.from(selectEl.options)
        .slice(0, 50)
        .map((opt) => ({
          Value: opt.value,
          Label: cleanText(opt.text || opt.label || opt.value),
        }));
    } else {
      const rawValue = (control as HTMLInputElement | HTMLTextAreaElement).value ?? '';
      observation.Value = isProtected ? (rawValue ? '[REDACTED]' : '') : rawValue;
    }

    fields.push(observation);
  }

  const actions: RemoteBrowserActionObservation[] = [];
  let actionCounter = 0;
  const actionCandidates = Array.from(
    document.querySelectorAll(
      'button, input[type="submit"], input[type="button"], a[href], [role="button"]',
    ),
  ) as HTMLElement[];

  for (const el of actionCandidates) {
    if (!isVisible(el)) {
      continue;
    }
    if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') {
      continue;
    }
    const tag = el.tagName.toLowerCase();
    const inputType = tag === 'input' ? (el.getAttribute('type') || '').toLowerCase() : '';
    const label =
      cleanText(
        el.getAttribute('aria-label') ||
          (tag === 'input' ? (el as HTMLInputElement).value : el.innerText || el.textContent) ||
          el.getAttribute('title'),
      ) || '';
    if (!label) {
      continue;
    }

    actionCounter += 1;
    const ref = `action-${actionCounter}`;
    el.setAttribute('data-mj-browser-ref', ref);

    const role: 'button' | 'link' | 'submit' =
      inputType === 'submit' || (tag === 'button' && (el.getAttribute('type') || 'submit').toLowerCase() === 'submit' && Boolean(el.closest('form')))
        ? 'submit'
        : tag === 'a'
          ? 'link'
          : 'button';
    const destructive = role === 'submit' || DESTRUCTIVE_ACTION_PATTERN.test(label);

    actions.push({
      Ref: ref,
      Label: label,
      Role: role,
      Destructive: destructive,
    });
    if (actions.length >= 60) {
      break;
    }
  }

  const links: RemoteBrowserLinkObservation[] = [];
  const seenHrefs = new Set<string>();
  const anchorNodes = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
  for (const a of anchorNodes) {
    if (!isVisible(a)) {
      continue;
    }
    const text = cleanText(a.innerText || a.textContent || a.getAttribute('aria-label'));
    const href = a.href;
    if (!text || !href || !/^https?:/i.test(href) || seenHrefs.has(href)) {
      continue;
    }
    seenHrefs.add(href);
    links.push({ Text: text, Href: href });
    if (links.length >= 40) {
      break;
    }
  }

  const bodyText = (document.body?.innerText ?? '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);

  return {
    url: window.location.href,
    title: document.title ?? '',
    text: bodyText,
    fields,
    actions,
    links,
  };
}

/**
 * Inspects the current page in `adapter` and returns a structured {@link RemoteBrowserPageObservation}.
 *
 * @param adapter The connected Playwright browser adapter.
 * @param observationId Monotonic observation identifier (e.g. `'obs-1'`).
 * @returns The structured page observation.
 */
export async function InspectPageDom(
  adapter: PlaywrightBrowserAdapter,
  observationId: string,
): Promise<RemoteBrowserPageObservation> {
  const hooks = adapter as unknown as IDomInspectableAdapterHooks;
  if (typeof hooks.InspectPageOverride === 'function') {
    return hooks.InspectPageOverride(observationId);
  }

  const page = getAdapterPage(adapter);
  if (page) {
    const raw = await withTimeout(page.evaluate(inPageInspectDom), DOM_EVALUATE_TIMEOUT_MS);
    if (raw) {
      return {
        ObservationID: observationId,
        Url: raw.url || adapter.CurrentUrl,
        Title: raw.title,
        Text: raw.text,
        Fields: raw.fields,
        Actions: raw.actions,
        Links: raw.links,
      };
    }
  }

  // Fallback for adapters without a direct Playwright Page (e.g. unit test fakes).
  const [title, text] = await Promise.all([
    adapter.GetTitle().catch(() => ''),
    adapter.GetVisibleText().catch(() => ''),
  ]);
  return {
    ObservationID: observationId,
    Url: adapter.CurrentUrl,
    Title: title,
    Text: text,
    Fields: [],
    Actions: [],
    Links: [],
  };
}

/**
 * Raw outcome returned by the in-page form-fill script.
 */
interface RawDomFillOutcome {
  success: boolean;
  filled: RemoteBrowserFilledFieldResult[];
  errors: string[];
}

/**
 * Self-contained browser-context function executed via `page.evaluate` to populate multiple form fields
 * and verify their updated DOM state.
 */
function inPageFillFields(
  inputs: ReadonlyArray<{ Target: string; Value: string | boolean }>,
): RawDomFillOutcome {
  const PROTECTED_PATTERN =
    /password|passcode|pin\b|otp|one[-_\s]?time|verification\s*code|cvv|cvc|csc|security\s*code|card\s*number|credit\s*card|debit\s*card|ssn|social\s*security|tax\s*id|routing\s*number|bank\s*account/i;

  const cleanText = (val: string | null | undefined): string =>
    (val ?? '').replace(/\s+/g, ' ').trim();

  const resolveFieldLabel = (el: HTMLElement): string => {
    const aria = cleanText(el.getAttribute('aria-label'));
    if (aria) {
      return aria;
    }
    if (el.id) {
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl && cleanText(lbl.textContent)) {
          return cleanText(lbl.textContent);
        }
      } catch {
        // ignore
      }
    }
    const wrap = el.closest('label');
    if (wrap) {
      const clone = wrap.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('input, select, textarea, button').forEach((n) => n.remove());
      const cleaned = cleanText(clone.textContent);
      if (cleaned) {
        return cleaned;
      }
    }
    return (
      cleanText(el.getAttribute('placeholder')) ||
      cleanText(el.getAttribute('name')) ||
      cleanText(el.id) ||
      el.tagName.toLowerCase()
    );
  };

  const allControls = Array.from(
    document.querySelectorAll('input, select, textarea'),
  ) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

  // Ensure every visible control has a data-mj-browser-ref if inspect wasn't run yet.
  let autoIndex = 0;
  for (const ctrl of allControls) {
    const type = ctrl.tagName.toLowerCase() === 'input' ? (ctrl.getAttribute('type') || 'text').toLowerCase() : ctrl.tagName.toLowerCase();
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset' || type === 'image') {
      continue;
    }
    autoIndex += 1;
    if (!ctrl.getAttribute('data-mj-browser-ref')) {
      ctrl.setAttribute('data-mj-browser-ref', `field-${autoIndex}`);
    }
  }

  const findControl = (
    targetRaw: string,
    desiredValue: string | boolean,
  ): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null => {
    const target = targetRaw.trim();
    const targetLower = target.toLowerCase();

    // 1. Exact ref match (`field-1`)
    const byRef = allControls.find(
      (c) => (c.getAttribute('data-mj-browser-ref') || '').toLowerCase() === targetLower,
    );
    if (byRef) {
      return byRef;
    }

    // 2. Radio group matching when target matches name/label and desiredValue matches radio value/label
    const desiredStr = String(desiredValue).trim().toLowerCase();
    const radioCandidates = allControls.filter(
      (c): c is HTMLInputElement =>
        c.tagName.toLowerCase() === 'input' && (c.getAttribute('type') || '').toLowerCase() === 'radio',
    );
    const matchingRadioGroup = radioCandidates.filter((r) => {
      const name = (r.getAttribute('name') || '').toLowerCase();
      const label = resolveFieldLabel(r).toLowerCase();
      return name === targetLower || label.includes(targetLower);
    });
    if (matchingRadioGroup.length > 1 && typeof desiredValue === 'string') {
      const specificRadio = matchingRadioGroup.find(
        (r) =>
          r.value.toLowerCase() === desiredStr ||
          resolveFieldLabel(r).toLowerCase().includes(desiredStr),
      );
      if (specificRadio) {
        return specificRadio;
      }
    }

    // 3. Exact id, name, aria-label, placeholder, or resolved label match
    for (const c of allControls) {
      const id = (c.id || '').toLowerCase();
      const name = (c.getAttribute('name') || '').toLowerCase();
      const label = resolveFieldLabel(c).toLowerCase();
      const placeholder = (c.getAttribute('placeholder') || '').toLowerCase();
      if (id === targetLower || name === targetLower || label === targetLower || placeholder === targetLower) {
        return c;
      }
    }

    // 4. Partial label / name / placeholder match
    for (const c of allControls) {
      const name = (c.getAttribute('name') || '').toLowerCase();
      const label = resolveFieldLabel(c).toLowerCase();
      const placeholder = (c.getAttribute('placeholder') || '').toLowerCase();
      if (label.includes(targetLower) || targetLower.includes(label) || name.includes(targetLower) || placeholder.includes(targetLower)) {
        return c;
      }
    }

    return null;
  };

  const setNativeValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && typeof descriptor.set === 'function') {
      descriptor.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  };

  const filled: RemoteBrowserFilledFieldResult[] = [];
  const errors: string[] = [];

  for (const item of inputs) {
    const control = findControl(item.Target, item.Value);
    if (!control) {
      errors.push(`Field "${item.Target}" was not found on the current page.`);
      continue;
    }

    const ref = control.getAttribute('data-mj-browser-ref') || item.Target;
    const label = resolveFieldLabel(control);
    const tag = control.tagName.toLowerCase();
    const inputType = tag === 'input' ? (control.getAttribute('type') || 'text').toLowerCase() : tag;
    const nameOrId = `${control.getAttribute('name') || ''} ${control.id || ''} ${control.getAttribute('autocomplete') || ''}`;

    if (inputType === 'password' || PROTECTED_PATTERN.test(`${label} ${nameOrId} ${inputType}`)) {
      errors.push(
        `Field "${label}" (${ref}) is a protected credential/payment input; ask the user to fill it via Collaborative takeover.`,
      );
      continue;
    }

    if (
      control.disabled ||
      control.getAttribute('aria-disabled') === 'true' ||
      ('readOnly' in control && Boolean((control as HTMLInputElement | HTMLTextAreaElement).readOnly))
    ) {
      errors.push(`Field "${label}" (${ref}) is disabled or read-only.`);
      continue;
    }

    if (inputType === 'checkbox' || inputType === 'radio') {
      const inputEl = control as HTMLInputElement;
      const shouldCheck =
        typeof item.Value === 'boolean'
          ? item.Value
          : !/^(false|0|no|off|unchecked)$/i.test(String(item.Value).trim());
      if (inputEl.checked !== shouldCheck) {
        inputEl.click();
        if (inputEl.checked !== shouldCheck) {
          inputEl.checked = shouldCheck;
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      filled.push({
        Ref: ref,
        Label: label,
        Value: String(inputEl.checked),
      });
      continue;
    }

    if (tag === 'select') {
      const selectEl = control as HTMLSelectElement;
      const desired = String(item.Value).trim();
      const desiredLower = desired.toLowerCase();
      const options = Array.from(selectEl.options);
      const matched =
        options.find(
          (o) =>
            o.value.toLowerCase() === desiredLower ||
            cleanText(o.text).toLowerCase() === desiredLower ||
            cleanText(o.label).toLowerCase() === desiredLower,
        ) ??
        options.find(
          (o) =>
            cleanText(o.text).toLowerCase().includes(desiredLower) ||
            o.value.toLowerCase().includes(desiredLower),
        );
      if (!matched) {
        errors.push(
          `Select field "${label}" (${ref}) has no option matching "${desired}". Available options: ${options
            .map((o) => cleanText(o.text) || o.value)
            .filter(Boolean)
            .join(', ')}`,
        );
        continue;
      }
      selectEl.value = matched.value;
      selectEl.dispatchEvent(new Event('input', { bubbles: true }));
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      selectEl.dispatchEvent(new Event('blur', { bubbles: true }));
      filled.push({
        Ref: ref,
        Label: label,
        Value: cleanText(matched.text) || selectEl.value,
      });
      continue;
    }

    const textEl = control as HTMLInputElement | HTMLTextAreaElement;
    const strValue = String(item.Value);
    textEl.focus();
    setNativeValue(textEl, strValue);
    filled.push({
      Ref: ref,
      Label: label,
      Value: textEl.value,
    });
  }

  return {
    success: errors.length === 0 && filled.length > 0,
    filled,
    errors,
  };
}

/**
 * Deterministically populates one or more form fields on the current page, verifies their values,
 * and returns a refreshed {@link RemoteBrowserPageObservation}.
 *
 * @param adapter The connected Playwright browser adapter.
 * @param values The list of `{ Target, Value }` entries to populate.
 * @param nextObservationId The observation ID to stamp on the post-fill observation.
 * @returns The action result carrying `Filled` and `Observation`.
 */
export async function FillPageFields(
  adapter: PlaywrightBrowserAdapter,
  values: ReadonlyArray<RemoteBrowserFillFieldInput>,
  nextObservationId: string,
): Promise<RemoteBrowserActionResult> {
  if (!values || values.length === 0) {
    return {
      Success: false,
      CurrentUrl: adapter.CurrentUrl,
      Detail: 'fill requires a non-empty Values array.',
    };
  }

  const hooks = adapter as unknown as IDomInspectableAdapterHooks;
  if (typeof hooks.FillFieldsOverride === 'function') {
    return hooks.FillFieldsOverride(values, nextObservationId);
  }

  const page = getAdapterPage(adapter);
  if (!page) {
    return {
      Success: false,
      CurrentUrl: adapter.CurrentUrl,
      Detail: 'Live DOM page is not available for structured form filling.',
    };
  }

  const outcome = await withTimeout(page.evaluate(inPageFillFields, values), DOM_EVALUATE_TIMEOUT_MS);
  const observation = await InspectPageDom(adapter, nextObservationId);

  if (!outcome) {
    return {
      Success: false,
      CurrentUrl: observation.Url || adapter.CurrentUrl,
      Detail: 'Timed out while filling form fields on the page.',
      Observation: observation,
    };
  }

  const detailParts: string[] = [];
  if (outcome.filled.length > 0) {
    detailParts.push(
      `Filled ${outcome.filled.length} field(s): ${outcome.filled.map((f) => `${f.Label}="${f.Value}"`).join(', ')}.`,
    );
  }
  if (outcome.errors.length > 0) {
    detailParts.push(outcome.errors.join(' '));
  }

  return {
    Success: outcome.success,
    CurrentUrl: observation.Url || adapter.CurrentUrl,
    Detail: detailParts.join(' ') || undefined,
    Filled: outcome.filled,
    Observation: observation,
  };
}

/**
 * Raw resolution result from the in-page ref/text click lookup.
 */
interface RawClickResolution {
  found: boolean;
  label: string;
  destructive: boolean;
  clicked: boolean;
  error?: string;
}

/**
 * Self-contained browser-context function executed via `page.evaluate` to locate and click an element
 * by `Ref` (`data-mj-browser-ref`) or visible `Text`, refusing destructive/submit actions.
 */
function inPageClickByRefOrText(arg: { ref?: string; text?: string }): RawClickResolution {
  const DESTRUCTIVE_ACTION_PATTERN =
    /\b(submit|purchase|buy\s+now|pay\b|place\s+order|checkout|delete|remove|destroy|cancel\s+account|close\s+account|confirm\s+order|authorize|wire\s+transfer|sign\s+in|log\s+in)\b/i;

  const cleanText = (val: string | null | undefined): string =>
    (val ?? '').replace(/\s+/g, ' ').trim();

  let targetEl: HTMLElement | null = null;

  if (arg.ref) {
    const refTrimmed = arg.ref.trim();
    targetEl = document.querySelector(`[data-mj-browser-ref="${CSS.escape(refTrimmed)}"]`) as HTMLElement | null;
  }

  if (!targetEl && arg.text) {
    const needle = arg.text.trim().toLowerCase();
    const candidates = Array.from(
      document.querySelectorAll(
        'button, a[href], input[type="submit"], input[type="button"], [role="button"], [role="link"], [role="tab"], [role="menuitem"], label, summary',
      ),
    ) as HTMLElement[];

    targetEl =
      candidates.find((el) => {
        const label = cleanText(
          el.getAttribute('aria-label') ||
            (el.tagName.toLowerCase() === 'input' ? (el as HTMLInputElement).value : el.innerText || el.textContent),
        ).toLowerCase();
        return label === needle;
      }) ??
      candidates.find((el) => {
        const label = cleanText(
          el.getAttribute('aria-label') ||
            (el.tagName.toLowerCase() === 'input' ? (el as HTMLInputElement).value : el.innerText || el.textContent),
        ).toLowerCase();
        return Boolean(label && (label.includes(needle) || needle.includes(label)));
      }) ??
      null;
  }

  if (!targetEl) {
    return {
      found: false,
      label: arg.ref || arg.text || '',
      destructive: false,
      clicked: false,
      error: `No clickable element matching ${arg.ref ? `ref "${arg.ref}"` : `text "${arg.text}"`} was found on the page.`,
    };
  }

  const tag = targetEl.tagName.toLowerCase();
  const inputType = tag === 'input' ? (targetEl.getAttribute('type') || '').toLowerCase() : '';
  const label =
    cleanText(
      targetEl.getAttribute('aria-label') ||
        (tag === 'input' ? (targetEl as HTMLInputElement).value : targetEl.innerText || targetEl.textContent) ||
        targetEl.getAttribute('title'),
    ) ||
    arg.ref ||
    arg.text ||
    tag;

  const isSubmit =
    inputType === 'submit' ||
    (tag === 'button' &&
      (targetEl.getAttribute('type') || 'submit').toLowerCase() === 'submit' &&
      Boolean(targetEl.closest('form')));
  const isDestructive = isSubmit || DESTRUCTIVE_ACTION_PATTERN.test(label);

  if (isDestructive) {
    return {
      found: true,
      label,
      destructive: true,
      clicked: false,
      error: `Refusing to automatically click submit/destructive control "${label}". Leave the prepared page ready and ask the user to click it via Collaborative takeover or confirm.`,
    };
  }

  targetEl.scrollIntoView({ block: 'center', inline: 'center' });
  targetEl.click();
  return {
    found: true,
    label,
    destructive: false,
    clicked: true,
  };
}

/**
 * Clicks an element on the current page identified by `action.Ref` or `action.Text`, enforcing
 * human-only guardrails on submit/destructive controls and returning an updated page observation.
 *
 * @param adapter The connected Playwright browser adapter.
 * @param action The click action carrying `Ref` or `Text`.
 * @param nextObservationId The observation ID to stamp on the post-click observation.
 * @returns The action result carrying `Observation`.
 */
export async function ClickPageByRefOrText(
  adapter: PlaywrightBrowserAdapter,
  action: RemoteBrowserClickAction,
  nextObservationId: string,
): Promise<RemoteBrowserActionResult> {
  const hooks = adapter as unknown as IDomInspectableAdapterHooks;
  if (typeof hooks.ClickByRefOrTextOverride === 'function') {
    return hooks.ClickByRefOrTextOverride(action, nextObservationId);
  }

  const page = getAdapterPage(adapter);
  if (!page) {
    return {
      Success: false,
      CurrentUrl: adapter.CurrentUrl,
      Detail: 'Live DOM page is not available for Ref/Text click resolution.',
    };
  }

  const resolution = await withTimeout(
    page.evaluate(inPageClickByRefOrText, { ref: action.Ref, text: action.Text }),
    DOM_EVALUATE_TIMEOUT_MS,
  );
  if (!resolution) {
    return {
      Success: false,
      CurrentUrl: adapter.CurrentUrl,
      Detail: 'Timed out while resolving Ref/Text click on the page.',
    };
  }

  if (!resolution.clicked) {
    const observation = await InspectPageDom(adapter, nextObservationId);
    return {
      Success: false,
      CurrentUrl: observation.Url || adapter.CurrentUrl,
      Detail: resolution.error || `Could not click "${resolution.label}".`,
      Observation: observation,
    };
  }

  // Allow brief settle for SPA route transitions or full-page navigations triggered by the click.
  await adapter.WaitForLoadState('domcontentloaded').catch(() => {});
  const observation = await InspectPageDom(adapter, nextObservationId);

  return {
    Success: true,
    CurrentUrl: observation.Url || adapter.CurrentUrl,
    Detail: `Clicked "${resolution.label}".`,
    Observation: observation,
  };
}
