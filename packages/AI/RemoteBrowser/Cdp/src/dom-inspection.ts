/**
 * @fileoverview Structured DOM perception (`inspect`), verified form filling (`fill`), the click guard,
 * and URL normalization for {@link CdpRemoteBrowserSession}.
 *
 * Everything that touches the page runs through ONE self-contained in-page script
 * ({@link inPageBrowserScript}), so inspect, fill and the click guard share a single definition of what
 * a visible field is, what a field is called, which fields are protected and which controls are
 * destructive. Refs are `f1`, `f2`, … for fields and `a1`, `a2`, … for buttons and links; each
 * inspect clears the previous refs, so a ref always names an element from the latest inspect.
 *
 * @module @memberjunction/remote-browser-cdp
 */

import { PlaywrightBrowserAdapter } from '@memberjunction/computer-use';
import {
  RemoteBrowserActionObservation,
  RemoteBrowserActionResult,
  RemoteBrowserFieldObservation,
  RemoteBrowserFilledFieldResult,
  RemoteBrowserFillFieldInput,
  RemoteBrowserLinkObservation,
  RemoteBrowserPageObservation,
} from '@memberjunction/remote-browser-base';

/** Most page text an inspect returns (characters). */
const INSPECT_TEXT_MAX_CHARS = 6000;

/**
 * Normalizes a model- or user-supplied URL to an http(s) URL: bare domains (`example.com`,
 * `httpbin.org/forms/post`) become `https://…` and local hosts (`localhost:4200`) `http://…`.
 * `about:blank` passes through. Every other scheme (`file:`, `data:`, `chrome:`, `javascript:`, …)
 * throws: it would let a prompt-injected agent read the API host's files or run script.
 *
 * @param rawUrl The raw URL or domain string.
 * @returns A normalized http(s) URL (or `about:blank`, or `''` for blank input).
 */
export function NormalizeNavigableUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.toLowerCase() === 'about:blank' || /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  // `host:port` parses like a scheme but is a bare host, so it falls through to the rules below.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[^/:?#]+:\d+(?:[/?#]|$)/.test(trimmed)) {
    throw new Error(`Only http and https pages can be opened (got "${trimmed.slice(0, 40)}").`);
  }
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}

/** The control a click (or an Enter key) resolves to, as the in-page guard sees it. */
export interface ClickTarget {
  /** Whether an element was found (always `false` for a point with nothing under it). */
  Found: boolean;
  /** The element's ref (`a3`, `f2`); set for a ref or text match so the click can target it exactly. */
  Ref?: string;
  /**
   * The element's visible label, or the name that makes it destructive when one does (for a selector, the
   * first destructive match's, else the first match's).
   */
  Label: string;
  /** `true` when its label says it submits, pays, places an order, deletes or signs in: a person must click it. */
  Destructive: boolean;
  /** `true` when the selector is not plain CSS, so the page cannot check what it matches. */
  InvalidSelector?: boolean;
}

/** What to resolve a click against: a ref or visible text from inspect, a CSS selector, or a viewport point. */
export interface ClickTargetQuery {
  Ref?: string;
  Text?: string;
  Selector?: string;
  X?: number;
  Y?: number;
}

/** Raw inspect payload from the page. */
interface RawInspection {
  url: string;
  title: string;
  text: string;
  fields: RemoteBrowserFieldObservation[];
  actions: RemoteBrowserActionObservation[];
  links: RemoteBrowserLinkObservation[];
}

/** Raw fill outcome from the page. */
interface RawFillOutcome {
  filled: RemoteBrowserFilledFieldResult[];
  errors: string[];
}

/** One request to the in-page script. */
type InPageRequest =
  | { Op: 'inspect'; MaxTextChars: number }
  | { Op: 'fill'; Values: ReadonlyArray<RemoteBrowserFillFieldInput> }
  | { Op: 'resolveClick'; Query: ClickTargetQuery }
  | { Op: 'resolveKey'; Key: ActivatingKey };

/** The result type of each in-page op. */
interface InPageResults {
  inspect: RawInspection;
  fill: RawFillOutcome;
  resolveClick: ClickTarget;
  resolveKey: ClickTarget;
}

/** A key that can activate a control: Enter (also submits a form) and Space. */
export type ActivatingKey = 'enter' | 'space';

/**
 * The in-page script. Self-contained (it is serialized into the page by `page.evaluate`, so it can
 * capture nothing from this module): every helper the three ops share is defined once, here.
 */
function inPageBrowserScript(req: InPageRequest): RawInspection | RawFillOutcome | ClickTarget {
  type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const REF_ATTR = 'data-mj-browser-ref';
  const PROTECTED =
    /password|passcode|pin\b|otp|one[-_\s]?time|verification\s*code|cvv|cvc|csc|security\s*code|card\s*number|number\s*on\s*card|credit\s*card|debit\s*card|cc-(number|csc|exp)|ssn|social\s*security|tax\s*id|routing\s*number|bank\s*account|account\s*(number|no\b|#)|\biban\b|secret|token|api[-_\s]?key|passphrase/i;
  const DESTRUCTIVE =
    /\b(submit|purchase|buy\s+now|pay\b|place\s+(your\s+)?order|checkout|delete|remove|destroy|cancel\s+account|close\s+account|confirm\s+(order|payment|purchase)|authorize|transfer|sign\s+in|log\s+in)\b/i;
  const NON_FIELD_TYPES = ['hidden', 'submit', 'button', 'reset', 'image'];
  const ACTION_SELECTOR = 'button, input[type="submit"], input[type="button"], a[href], [role="button"]';
  const TEXT_CLICK_SELECTOR = `${ACTION_SELECTOR}, [role="link"], [role="tab"], [role="menuitem"], label, summary`;

  const clean = (val: string | null | undefined, max = 160): string => (val ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

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

  const typeOf = (el: Element): string =>
    el.tagName === 'INPUT' ? (el.getAttribute('type') || 'text').toLowerCase() : el.tagName.toLowerCase();

  const labelledByText = (el: Element): string =>
    clean(
      (el.getAttribute('aria-labelledby') ?? '')
        .split(/\s+/)
        .map((id) => (id ? document.getElementById(id)?.textContent ?? '' : ''))
        .join(' '),
    );

  const fieldLabel = (el: Control): string => {
    const aria = clean(el.getAttribute('aria-label'));
    if (aria) {
      return aria;
    }
    const labelledBy = labelledByText(el);
    if (labelledBy) {
      return labelledBy;
    }
    for (const label of Array.from(el.labels ?? [])) {
      const copy = label.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('input, select, textarea, button').forEach((n) => n.remove());
      const text = clean(copy.textContent);
      if (text) {
        return text;
      }
    }
    return (
      clean(el.getAttribute('placeholder')) ||
      clean(el.getAttribute('name')) ||
      clean(el.getAttribute('title')) ||
      clean(el.id) ||
      el.tagName.toLowerCase()
    );
  };

  // Every name a field carries, not just the one that won as its label: a title or autocomplete
  // token can be the only thing that says "card number".
  const isProtected = (el: Control): boolean => {
    const type = typeOf(el);
    const names = [fieldLabel(el), labelledByText(el), type, el.id]
      .concat(['aria-label', 'title', 'placeholder', 'name', 'autocomplete'].map((a) => el.getAttribute(a) ?? ''));
    return type === 'password' || PROTECTED.test(names.join(' '));
  };

  const isLocked = (el: Control): boolean =>
    el.disabled || el.getAttribute('aria-disabled') === 'true' || ('readOnly' in el && Boolean(el.readOnly));

  const actionLabel = (el: HTMLElement): string =>
    clean(el.getAttribute('aria-label') || (el.tagName === 'INPUT' ? (el as HTMLInputElement).value : el.innerText || el.textContent) || el.getAttribute('title'));

  const isSubmit = (el: HTMLElement): boolean =>
    (el.tagName === 'INPUT' && typeOf(el) === 'submit') ||
    (el.tagName === 'BUTTON' && (el.getAttribute('type') || 'submit').toLowerCase() === 'submit' && Boolean(el.closest('form')));

  // The name that makes a control destructive, or '' when none does. Every name a person sees counts, not
  // just the one shown as its label: an aria-label "Continue" on a "Pay now" button must not hide it. A
  // `name` is a form key and a `title` a tooltip, so neither counts while the control has another name
  // (they refused a Search button named "submit" or titled "Submit search"). A label clicks the control it
  // labels, so it is judged as that control. The name alone decides, not "is a submit button": that rule
  // also refused Search and Add to cart.
  const destructiveName = (el: HTMLElement): string => {
    const target = el instanceof HTMLLabelElement && el.control ? (el.control as HTMLElement) : el;
    const names = [target.getAttribute('aria-label'), labelledByText(target), target.tagName === 'INPUT' ? (target as HTMLInputElement).value : '', target.innerText || target.textContent].map((v) => clean(v));
    return [...names, names.some(Boolean) ? '' : clean(target.getAttribute('title'))].find((n) => DESTRUCTIVE.test(n)) ?? '';
  };

  // What a click or key press would activate, labelled by the name that makes it destructive when one does.
  const judge = (el: HTMLElement): Pick<ClickTarget, 'Label' | 'Destructive'> => {
    const destructive = destructiveName(el);
    return { Label: destructive || actionLabel(el) || el.tagName.toLowerCase(), Destructive: Boolean(destructive) };
  };

  // Focus, a hit test and a selector all stop at a shadow host; these follow open shadow roots down to
  // the element itself, as Playwright's CSS and a real key press or click do.
  const deepQueryAll = (selector: string): HTMLElement[] => {
    const found: HTMLElement[] = [];
    const roots: Array<Document | ShadowRoot> = [document];
    for (let i = 0; i < roots.length; i++) {
      found.push(...Array.from(roots[i].querySelectorAll<HTMLElement>(selector)));
      roots[i].querySelectorAll('*').forEach((n) => {
        if (n.shadowRoot) {
          roots.push(n.shadowRoot);
        }
      });
    }
    return found;
  };
  const deepActive = (): HTMLElement | null => {
    let el = document.activeElement as HTMLElement | null;
    while (el?.shadowRoot?.activeElement) {
      el = el.shadowRoot.activeElement as HTMLElement;
    }
    return el;
  };
  const deepFromPoint = (x: number, y: number): HTMLElement | null => {
    let el = document.elementFromPoint(x, y) as HTMLElement | null;
    while (el?.shadowRoot) {
      const inner = el.shadowRoot.elementFromPoint(x, y) as HTMLElement | null;
      if (!inner || inner === el) {
        break;
      }
      el = inner;
    }
    return el;
  };

  const visibleFields = (): Control[] =>
    (deepQueryAll('input, select, textarea') as Control[]).filter(
      (el) => !NON_FIELD_TYPES.includes(typeOf(el)) && isVisible(el),
    );

  const byRef = (ref: string | undefined): HTMLElement | null =>
    ref && /^[fa]\d+$/i.test(ref.trim()) ? deepQueryAll(`[${REF_ATTR}="${ref.trim().toLowerCase()}"]`)[0] ?? null : null;

  if (req.Op === 'inspect') {
    // A ref names an element from THIS inspect only: an old ref left on a now-hidden wizard step
    // would otherwise be filled or clicked in place of the visible one.
    deepQueryAll(`[${REF_ATTR}]`).forEach((el) => el.removeAttribute(REF_ATTR));

    const fields: RemoteBrowserFieldObservation[] = visibleFields().map((control, i) => {
      const ref = `f${i + 1}`;
      control.setAttribute(REF_ATTR, ref);
      const type = typeOf(control);
      let label = fieldLabel(control);
      if (type === 'radio' || type === 'checkbox') {
        const value = clean(control.value);
        if (value && value.toLowerCase() !== 'on' && !label.toLowerCase().includes(value.toLowerCase())) {
          label = `${label} (${value})`;
        }
      }
      const name = clean(control.getAttribute('name') || control.id, 80);
      const isSecret = isProtected(control);
      const field: RemoteBrowserFieldObservation = {
        Ref: ref,
        Label: label,
        ...(name ? { Name: name } : {}),
        Kind: type,
        Required: control.required || control.getAttribute('aria-required') === 'true',
        Writable: !isSecret && !isLocked(control),
        ...(isSecret ? { Redacted: true } : {}),
      };
      if (type === 'checkbox' || type === 'radio') {
        field.Checked = (control as HTMLInputElement).checked;
        field.Value = control.value || String(field.Checked);
      } else if (control.tagName === 'SELECT') {
        const select = control as HTMLSelectElement;
        field.Value = isSecret ? '[REDACTED]' : select.value;
        field.Options = Array.from(select.options)
          .slice(0, 50)
          .map((opt) => ({ Value: opt.value, Label: clean(opt.text || opt.label || opt.value) }));
      } else {
        field.Value = isSecret ? (control.value ? '[REDACTED]' : '') : control.value;
      }
      return field;
    });

    const actions: RemoteBrowserActionObservation[] = [];
    for (const el of deepQueryAll(ACTION_SELECTOR)) {
      if (!isVisible(el) || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') {
        continue;
      }
      const label = actionLabel(el);
      if (!label) {
        continue;
      }
      const ref = `a${actions.length + 1}`;
      el.setAttribute(REF_ATTR, ref);
      actions.push({ Ref: ref, Label: label, Role: isSubmit(el) ? 'submit' : el.tagName === 'A' ? 'link' : 'button', Destructive: Boolean(destructiveName(el)) });
      if (actions.length >= 60) {
        break;
      }
    }

    const links: RemoteBrowserLinkObservation[] = [];
    const seen = new Set<string>();
    for (const a of deepQueryAll('a[href]') as HTMLAnchorElement[]) {
      const text = clean(a.innerText || a.textContent || a.getAttribute('aria-label'));
      if (!text || !/^https?:/i.test(a.href) || seen.has(a.href) || !isVisible(a)) {
        continue;
      }
      seen.add(a.href);
      links.push({ Text: text, Href: a.href });
      if (links.length >= 40) {
        break;
      }
    }

    const body = document.body as HTMLElement | null;
    return {
      url: window.location.href,
      title: document.title ?? '',
      text: (body?.innerText ?? body?.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim().slice(0, req.MaxTextChars),
      fields,
      actions,
      links,
    };
  }

  if (req.Op === 'fill') {
    const controls = visibleFields();
    const find = (targetRaw: string, desired: string | boolean): Control | null => {
      const target = targetRaw.trim().toLowerCase();
      if (/^f\d+$/.test(target)) {
        // A ref only ever names the field the latest inspect stamped, and only while it is visible.
        const ref = byRef(target);
        return controls.find((c) => c === ref) ?? null;
      }
      // A radio group named by its group, with the value naming the option.
      const radios = controls.filter((c) => typeOf(c) === 'radio' && ((c.getAttribute('name') ?? '').toLowerCase() === target || fieldLabel(c).toLowerCase().includes(target)));
      if (radios.length > 1 && typeof desired === 'string') {
        const want = desired.trim().toLowerCase();
        const radio = radios.find((r) => r.value.toLowerCase() === want || fieldLabel(r).toLowerCase().includes(want));
        if (radio) {
          return radio;
        }
      }
      const names = (c: Control) => [c.id, c.getAttribute('name') ?? '', fieldLabel(c), c.getAttribute('placeholder') ?? ''].map((s) => s.toLowerCase());
      return (
        controls.find((c) => names(c).includes(target)) ??
        controls.find((c) => names(c).slice(1).some((n) => n && n.includes(target))) ??
        null
      );
    };

    const fire = (el: Element, ...types: string[]) => types.forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true })));
    const filled: RemoteBrowserFilledFieldResult[] = [];
    const errors: string[] = [];

    for (const item of req.Values) {
      const control = find(item.Target, item.Value);
      if (!control) {
        errors.push(`Field "${item.Target}" was not found on the current page; inspect again for fresh refs.`);
        continue;
      }
      const ref = control.getAttribute(REF_ATTR) || item.Target;
      const label = fieldLabel(control);
      if (isProtected(control)) {
        errors.push(`Field "${label}" (${ref}) is a protected credential or payment input; ask the user to fill it in the browser.`);
        continue;
      }
      if (isLocked(control)) {
        errors.push(`Field "${label}" (${ref}) is disabled or read-only.`);
        continue;
      }
      const type = typeOf(control);
      if (type === 'checkbox' || type === 'radio') {
        const input = control as HTMLInputElement;
        const shouldCheck = typeof item.Value === 'boolean' ? item.Value : !/^(false|0|no|off|unchecked)$/i.test(String(item.Value).trim());
        if (input.checked !== shouldCheck) {
          input.click();
          if (input.checked !== shouldCheck) {
            input.checked = shouldCheck;
            fire(input, 'input', 'change');
          }
        }
        filled.push({ Ref: ref, Label: label, Value: String(input.checked) });
        continue;
      }
      if (control.tagName === 'SELECT') {
        const select = control as HTMLSelectElement;
        const want = String(item.Value).trim().toLowerCase();
        const options = Array.from(select.options);
        const match =
          options.find((o) => o.value.toLowerCase() === want || clean(o.text).toLowerCase() === want) ??
          options.find((o) => clean(o.text).toLowerCase().includes(want) || o.value.toLowerCase().includes(want));
        if (!match) {
          errors.push(`Select field "${label}" (${ref}) has no option matching "${String(item.Value)}". Options: ${options.map((o) => clean(o.text) || o.value).filter(Boolean).join(', ')}`);
          continue;
        }
        select.value = match.value;
        fire(select, 'input', 'change', 'blur');
        filled.push({ Ref: ref, Label: label, Value: clean(match.text) || select.value });
        continue;
      }
      // The native setter, not `el.value =`: React and Vue track the value through it.
      const text = control as HTMLInputElement | HTMLTextAreaElement;
      const proto = text.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      text.focus();
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(text, String(item.Value));
      fire(text, 'input', 'change', 'blur');
      filled.push({ Ref: ref, Label: label, Value: text.value });
      if (String(item.Value) !== '' && text.value === '') {
        errors.push(`Field "${label}" (${ref}) reads back empty after "${String(item.Value)}"; it likely expects another format.`);
      }
    }
    return { filled, errors };
  }

  if (req.Op === 'resolveKey') {
    // Enter and Space activate the focused control; Enter in a field also submits its form through the
    // form's default button.
    const active = deepActive();
    if (!active || active.tagName === 'TEXTAREA' || active.isContentEditable) {
      return { Found: false, Label: '', Destructive: false };
    }
    const target = active.matches(ACTION_SELECTOR)
      ? active
      : req.Key === 'enter'
        ? active.closest('form')?.querySelector<HTMLElement>('button:not([type]), button[type="submit"], input[type="submit"], input[type="image"]') ?? null
        : null;
    return target ? { Found: true, ...judge(target) } : { Found: false, Label: '', Destructive: false };
  }

  // resolveClick
  const q = req.Query;
  if (q.Selector) {
    // Every match, not the first: the click may land on any of them (one below the fold, or one inside
    // an open shadow root, which Playwright's CSS also reaches).
    let matches: HTMLElement[];
    try {
      // A match inside a control (an icon, an SVG, a span) clicks that control, so judge the control.
      matches = deepQueryAll(q.Selector).map((m) => m.closest<HTMLElement>(TEXT_CLICK_SELECTOR) ?? m);
    } catch {
      return { Found: false, Label: q.Selector, Destructive: false, InvalidSelector: true };
    }
    const hit = matches.find((m) => destructiveName(m)) ?? matches[0];
    return hit ? { Found: true, ...judge(hit) } : { Found: false, Label: q.Selector, Destructive: false };
  }
  let el: HTMLElement | null = null;
  if (q.Ref) {
    el = byRef(q.Ref);
  } else if (q.Text) {
    const needle = q.Text.trim().toLowerCase();
    const candidates = deepQueryAll(TEXT_CLICK_SELECTOR).filter(isVisible);
    el =
      candidates.find((c) => actionLabel(c).toLowerCase() === needle) ??
      candidates.find((c) => {
        const label = actionLabel(c).toLowerCase();
        return Boolean(label) && (label.includes(needle) || needle.includes(label));
      }) ??
      null;
    // Give a text match a ref so the click targets exactly this element.
    if (el && !el.getAttribute(REF_ATTR)) {
      const used = deepQueryAll(`[${REF_ATTR}^="a"]`).map((n) => Number((n.getAttribute(REF_ATTR) ?? '').slice(1)) || 0);
      el.setAttribute(REF_ATTR, `a${Math.max(0, ...used) + 1}`);
    }
  } else if (typeof q.X === 'number' && typeof q.Y === 'number') {
    const hit = deepFromPoint(q.X, q.Y);
    el = hit?.closest<HTMLElement>(TEXT_CLICK_SELECTOR) ?? hit;
  }
  if (!el) {
    return { Found: false, Label: q.Ref || q.Text || '', Destructive: false };
  }
  return {
    Found: true,
    ...(q.Ref || q.Text ? { Ref: el.getAttribute(REF_ATTR) ?? undefined } : {}),
    ...judge(el),
  };
}

/**
 * Runs one op of {@link inPageBrowserScript} through the adapter. Throws when the page cannot run it
 * (no live page, or it outlived the adapter's action timeout).
 */
async function runInPage<K extends InPageRequest['Op']>(
  adapter: PlaywrightBrowserAdapter,
  req: Extract<InPageRequest, { Op: K }>,
): Promise<InPageResults[K]> {
  const result = await adapter.EvaluateInPage(inPageBrowserScript, req);
  if (result === null) {
    throw new Error('The page did not respond (no live page, or it timed out).');
  }
  return result as InPageResults[K];
}

/**
 * Inspects the current page: fields (`f1`, …), buttons and links (`a1`, …), links with their URLs,
 * and up to {@link INSPECT_TEXT_MAX_CHARS} characters of visible text.
 *
 * @param adapter The connected browser adapter.
 * @param observationId The observation identifier to stamp (e.g. `'obs-1'`).
 */
export async function InspectPageDom(adapter: PlaywrightBrowserAdapter, observationId: string): Promise<RemoteBrowserPageObservation> {
  const raw = await runInPage(adapter, { Op: 'inspect', MaxTextChars: INSPECT_TEXT_MAX_CHARS });
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

/**
 * Fills fields by ref (`f1`), name, id or label, refusing protected and read-only fields, then
 * inspects again so the result carries the page as it now is.
 *
 * @param adapter The connected browser adapter.
 * @param values The fields and values to fill.
 * @param observationId The observation identifier for the post-fill inspect.
 */
export async function FillPageFields(
  adapter: PlaywrightBrowserAdapter,
  values: ReadonlyArray<RemoteBrowserFillFieldInput>,
  observationId: string,
): Promise<RemoteBrowserActionResult> {
  if (values.length === 0) {
    return { Success: false, CurrentUrl: adapter.CurrentUrl, Detail: 'fill requires at least one value.' };
  }
  const outcome = await runInPage(adapter, { Op: 'fill', Values: values });
  const observation = await InspectPageDom(adapter, observationId);
  const filledText = outcome.filled.length > 0 ? `Filled ${outcome.filled.length} field(s): ${outcome.filled.map((f) => `${f.Label}="${f.Value}"`).join(', ')}.` : '';
  return {
    Success: outcome.errors.length === 0 && outcome.filled.length > 0,
    CurrentUrl: observation.Url,
    Detail: [filledText, ...outcome.errors].filter(Boolean).join(' ') || undefined,
    Filled: outcome.filled,
    Observation: observation,
  };
}

/**
 * Resolves what a click would hit, so the session can refuse a destructive control before clicking.
 *
 * @param adapter The connected browser adapter.
 * @param query A ref or visible text from inspect, a CSS selector, or a viewport point.
 */
export async function ResolveClickTarget(adapter: PlaywrightBrowserAdapter, query: ClickTargetQuery): Promise<ClickTarget> {
  return runInPage(adapter, { Op: 'resolveClick', Query: query });
}

/**
 * Resolves what pressing `key` would activate: the focused control (followed into open shadow roots), or,
 * for Enter in a field, its form's default button.
 */
export async function ResolveKeyTarget(adapter: PlaywrightBrowserAdapter, key: ActivatingKey): Promise<ClickTarget> {
  return runInPage(adapter, { Op: 'resolveKey', Key: key });
}
