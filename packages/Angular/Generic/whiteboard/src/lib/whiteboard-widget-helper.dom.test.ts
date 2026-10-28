import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WHITEBOARD_SUBMIT_HELPER } from './whiteboard-widget-bridge';

/**
 * The injected widget helper's TWO-WAY side, EXECUTED (PLAN §12.2 D1–D5): ready/hello, the
 * command listener, inspect outlines, operate steps, author tagging, actions and state.
 *
 * HARNESS. Every test gets a FRESH document: a new same-origin `<iframe>` inside the vitest
 * jsdom window, with the helper run in the frame's own realm through `new frame.Function(...)`,
 * so `window` / `document` / `Event` / `Promise` inside the helper are the frame's and
 * once-per-document behaviour (ready token, onRestore, listeners) is observable per test.
 * Four globals are injected as parameters:
 *  - `parent` — a stub whose `postMessage` records (a JSON snapshot of) every outbound message.
 *    jsdom's own `postMessage` never sets `event.source`, so commands are dispatched as
 *    `MessageEvent`s with `source` set to that stub — which jsdom accepts;
 *  - `setTimeout` / `clearTimeout` / `Date` — the vitest fake-timer versions from the outer
 *    realm, so debounce, settle and fallback timings are driven deterministically.
 * No new dependency (the standalone `JSDOM` constructor is not needed).
 *
 * TRUSTED EVENTS. `el.click()` and `dispatchEvent` are untrusted in jsdom, as in browsers, and
 * jsdom has no API for a trusted click. jsdom does fire trusted events from its own internals:
 * `el.focus()` → trusted `focus` / `focusin`, `form.requestSubmit()` → trusted `submit`. The
 * "isTrusted → user, even inside the agent window" rule is exercised through those.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

interface ActionInfo { name: string; description?: string }
interface StepResult { ok: boolean; code?: string; error?: string }
interface ReplyResult {
  outline?: string;
  actions?: ActionInfo[];
  state?: string;
  answered?: { at: number; data: Json };
  steps?: StepResult[];
  submitted?: Json;
  result?: Json;
}
interface InteractionRecord { kind: string; target: string; value?: string; tag?: string }
interface Posted {
  __mjWhiteboardReady?: boolean; doc?: string; actions?: ActionInfo[]; hasState?: boolean;
  __mjWhiteboardReply?: boolean; id?: string; ok?: boolean; result?: ReplyResult; error?: string; code?: string;
  __mjWhiteboardSubmit?: boolean; data?: Json; by?: string;
  __mjWhiteboardInteraction?: boolean; events?: InteractionRecord[];
  __mjWhiteboardActions?: boolean;
  __mjWhiteboardState?: boolean; state?: string;
}
interface StateEnvelope { declared: Json; fields: Record<string, Json> | null; answered: { at: number; data: Json } | null }

type ActionHandler = (payload: Json) => Json | undefined | object | Promise<Json | undefined>;
interface MJWhiteboardApi {
  submit(data: Json): void;
  onAction(name: string, handler: ActionHandler, description?: string): boolean;
  offAction(name: string): boolean;
  setState(state: Json): void;
  onRestore(fn: (state: Json) => void): void;
  configure(options: { agentOperable?: boolean; autoState?: boolean }): void;
}
type FrameWindow = Window & typeof globalThis & { MJWhiteboard: MJWhiteboardApi };

interface ParentStub { postMessage(message: Posted, targetOrigin: string): void }

interface Frame {
  Win: FrameWindow;
  Doc: Document;
  Parent: ParentStub;
  Posted: Posted[];
}

interface FrameOptions {
  Title?: string;
  /** Runs after the helper, before DOMContentLoaded — where a widget's own script would run. */
  Setup?: (mj: MJWhiteboardApi, win: FrameWindow) => void;
  /** Start with `readyState === 'complete'` (the helper posts ready at once). */
  AlreadyLoaded?: boolean;
}

const HELPER_BODY = WHITEBOARD_SUBMIT_HELPER.replace(/^<script>/, '').replace(/<\/script>$/, '');
const iframes: HTMLIFrameElement[] = [];
let commandSeq = 0;

function makeFrame(html: string, options: FrameOptions = {}): Frame {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  iframes.push(iframe);
  const win = iframe.contentWindow as FrameWindow;
  const doc = win.document;
  if (options.Title) {
    doc.title = options.Title;
  }
  doc.body.innerHTML = html;
  const posted: Posted[] = [];
  const parentStub: ParentStub = { postMessage: (message) => { posted.push(JSON.parse(JSON.stringify(message))); } };
  if (!options.AlreadyLoaded) {
    Object.defineProperty(doc, 'readyState', { configurable: true, get: () => 'loading' });
  }
  const run = new win.Function('parent', 'setTimeout', 'clearTimeout', 'Date', HELPER_BODY);
  run.call(null, parentStub, setTimeout, clearTimeout, Date);
  options.Setup?.(win.MJWhiteboard, win);
  if (!options.AlreadyLoaded) {
    Reflect.deleteProperty(doc, 'readyState');
    doc.dispatchEvent(new win.Event('DOMContentLoaded'));
  }
  return { Win: win, Doc: doc, Parent: parentStub, Posted: posted };
}

/** Dispatch one host command into the frame; returns its correlation id. */
function send(frame: Frame, op: string, args: Json = {}, source: object = frame.Parent): string {
  const id = `c${++commandSeq}`;
  const data = { __mjWhiteboardCommand: true, id, op, args };
  frame.Win.dispatchEvent(new frame.Win.MessageEvent('message', { data, source: source as MessageEventSource }));
  return id;
}

function replyTo(frame: Frame, id: string): Posted | undefined {
  return frame.Posted.find((m) => m.__mjWhiteboardReply === true && m.id === id);
}

function readies(frame: Frame): Posted[] {
  return frame.Posted.filter((m) => m.__mjWhiteboardReady === true);
}

function submits(frame: Frame): Posted[] {
  return frame.Posted.filter((m) => m.__mjWhiteboardSubmit === true);
}

function batches(frame: Frame): Posted[] {
  return frame.Posted.filter((m) => m.__mjWhiteboardInteraction === true);
}

function states(frame: Frame): StateEnvelope[] {
  return frame.Posted.filter((m) => m.__mjWhiteboardState === true).map((m) => JSON.parse(m.state ?? 'null'));
}

function inspect(frame: Frame): ReplyResult {
  const id = send(frame, 'inspect');
  return replyTo(frame, id)?.result ?? {};
}

function el<T extends HTMLElement = HTMLElement>(frame: Frame, selector: string): T {
  const found = frame.Doc.querySelector<T>(selector);
  if (!found) {
    throw new Error(`no element for ${selector}`);
  }
  return found;
}

interface StepArg { target: string; op: string; value?: string }

/** Run an operate command and let it settle (yield + 250 ms). */
async function operate(frame: Frame, steps: StepArg[], ringColor = '#123456'): Promise<Posted | undefined> {
  const id = send(frame, 'operate', { steps: steps.map((s) => ({ ...s })), ringColor });
  await vi.advanceTimersByTimeAsync(400);
  return replyTo(frame, id);
}

async function call(frame: Frame, action: string, payload: Json = null): Promise<Posted | undefined> {
  const id = send(frame, 'call', { action, payload });
  await vi.advanceTimersByTimeAsync(0);
  return replyTo(frame, id);
}

/** A promise the test resolves itself — keeps a `call` (and so the agent window) open. */
function deferred(): { Promise: Promise<Json>; Resolve: (v: Json) => void } {
  let resolve: (v: Json) => void = () => undefined;
  const promise = new Promise<Json>((r) => { resolve = r; });
  return { Promise: promise, Resolve: resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  while (iframes.length) {
    iframes.pop()?.remove();
  }
  vi.useRealTimers();
});

// ───────────────────────────────────────────────────────────── D4 ready / hello / command gate

describe('D4: ready, hello and the command gate', () => {
  it('posts ready on DOMContentLoaded (not before) with a document token, actions and hasState', () => {
    let readyBeforeLoad = -1;
    const frame = makeFrame('<p>x</p>', {
      Setup: (mj) => {
        mj.onAction('next', () => 1, 'Go to the next question');
        mj.setState({ q: 1 });
        readyBeforeLoad = 0; // marker that setup ran before the DOMContentLoaded dispatch
      }
    });
    expect(readyBeforeLoad).toBe(0);
    const [ready, ...more] = readies(frame);
    expect(more).toEqual([]);
    expect(typeof ready.doc).toBe('string');
    expect(ready.doc!.length).toBeGreaterThan(0);
    expect(ready.doc!.length).toBeLessThanOrEqual(64);
    expect(ready.actions).toEqual([{ name: 'next', description: 'Go to the next question' }]);
    expect(ready.hasState).toBe(true);
  });

  it('a document that is already loaded posts ready immediately', () => {
    const frame = makeFrame('<p>x</p>', { AlreadyLoaded: true });
    expect(readies(frame)).toHaveLength(1);
    expect(readies(frame)[0].hasState).toBe(false);
  });

  it('no ready before DOMContentLoaded while the document is still loading', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    iframes.push(iframe);
    const win = iframe.contentWindow as FrameWindow;
    const posted: Posted[] = [];
    Object.defineProperty(win.document, 'readyState', { configurable: true, get: () => 'loading' });
    new win.Function('parent', 'setTimeout', 'clearTimeout', 'Date', HELPER_BODY)
      .call(null, { postMessage: (m: Posted) => posted.push(m) }, setTimeout, clearTimeout, Date);
    expect(posted.filter((m) => m.__mjWhiteboardReady)).toEqual([]);
  });

  it('hello re-posts ready with the SAME document token and replies ok', () => {
    const frame = makeFrame('<p>x</p>');
    const id = send(frame, 'hello', null);
    const [first, second] = readies(frame);
    expect(second?.doc).toBe(first.doc);
    expect(replyTo(frame, id)).toMatchObject({ ok: true });
  });

  it('two documents mint different tokens', () => {
    const a = makeFrame('<p>a</p>');
    const b = makeFrame('<p>b</p>');
    expect(readies(a)[0].doc).not.toBe(readies(b)[0].doc);
  });

  it('commands from any source other than parent are ignored (no reply, no effect)', () => {
    const frame = makeFrame('<button>Go</button>');
    const fromSelf = send(frame, 'inspect', {}, frame.Win);
    const fromStranger = send(frame, 'inspect', {}, { postMessage: () => undefined });
    expect(replyTo(frame, fromSelf)).toBeUndefined();
    expect(replyTo(frame, fromStranger)).toBeUndefined();
  });

  it('messages without the command marker or id are ignored; an unknown op is invalid_args', () => {
    const frame = makeFrame('<p>x</p>');
    frame.Win.dispatchEvent(new frame.Win.MessageEvent('message', {
      data: { id: 'x1', op: 'inspect' }, source: frame.Parent as object as MessageEventSource
    }));
    frame.Win.dispatchEvent(new frame.Win.MessageEvent('message', {
      data: { __mjWhiteboardCommand: true, op: 'inspect' }, source: frame.Parent as object as MessageEventSource
    }));
    expect(frame.Posted.filter((m) => m.__mjWhiteboardReply)).toEqual([]);
    const id = send(frame, 'explode');
    expect(replyTo(frame, id)).toMatchObject({ ok: false, code: 'invalid_args' });
  });
});

// ───────────────────────────────────────────────────────────── D1 inspect → outline

const PLANET_QUIZ = `
  <h2>Question 1 of 3</h2>
  <p>Which planet is closest to the sun?</p>
  <label><input type="radio" name="answer" value="Mercury"> Mercury</label>
  <label><input type="radio" name="answer" value="Venus" checked> Venus</label>
  <label>Confidence <input type="range" name="Confidence" min="0" max="100" value="40"></label>
  <input type="text" name="Card number" value="4111 1111 1111 1111">
  <button>Submit</button>
  <button disabled>Hint</button>
`;

describe('D1: inspect outline', () => {
  it('renders the PLAN §1 outline: header, context, field and action refs, redaction', () => {
    const frame = makeFrame(PLANET_QUIZ, {
      Title: 'Planet quiz',
      Setup: (mj) => {
        mj.onAction('next', () => null);
        mj.onAction('reset', () => null);
        mj.setState({ q: 1, score: 0 });
      }
    });
    const result = inspect(frame);
    expect(result.outline).toBe([
      'widget "Planet quiz" · actions: next, reset · state: {"q":1,"score":0}',
      'h2 "Question 1 of 3"',
      'text "Which planet is closest to the sun?"',
      'f1 radio "Mercury" (group "answer") = unchecked',
      'f2 radio "Venus" (group "answer") = checked',
      'f3 range "Confidence" = 40 (0–100)',
      'f4 text "Card number" = [REDACTED, not writable]',
      'a1 button "Submit"',
      'a2 button "Hint" [disabled]'
    ].join('\n'));
    expect(result.actions).toEqual([{ name: 'next' }, { name: 'reset' }]);
    expect(result.state).toBe('{"q":1,"score":0}');
    expect(result.outline).not.toContain('4111');
  });

  it('visibility comes from computed style and attributes, not geometry', () => {
    const frame = makeFrame(`
      <style>.gone { display: none; }</style>
      <button>Shown</button>
      <button style="display:none">StyleNone</button>
      <div class="gone"><button>ClassNone</button></div>
      <button style="visibility:hidden">Invisible</button>
      <button hidden>HiddenAttr</button>
      <div aria-hidden="true"><button>AriaHidden</button></div>
      <details><summary>More</summary><button>InClosedDetails</button></details>
      <details open><summary>Open</summary><button>InOpenDetails</button></details>
    `);
    const lines = inspect(frame).outline!.split('\n').slice(1);
    expect(lines).toEqual(['a1 button "Shown"', 'a2 button "InOpenDetails"']);
  });

  it('privacy: password/hidden omitted; protected fields redacted; Flashcard/Scorecard/Discard are not', () => {
    const frame = makeFrame(`
      <input type="password" name="pw" value="hunter2">
      <input type="hidden" name="token" value="tok-123">
      <input name="cc" autocomplete="cc-number" value="4111">
      <input name="code" autocomplete="one-time-code" value="654321">
      <input name="cvv" value="999">
      <input id="ssn-field" value="123-45-6789">
      <label>Your passcode <input name="pin" value="2468"></label>
      <input name="Flashcard" value="mitochondria">
      <input name="Scorecard" value="ten">
      <input name="Discard" value="pile">
      <input name="Flashcard notes" value="cell biology">
      <input name="Card No" value="5500">
    `);
    const outline = inspect(frame).outline!;
    for (const secret of ['hunter2', 'tok-123', '"pw"', '"token"', '4111', '654321', '999', '123-45-6789', '2468', '5500']) {
      expect(outline).not.toContain(secret);
    }
    expect(outline.match(/\[REDACTED, not writable\]/g)).toHaveLength(6);
    expect(outline).toContain('text "Flashcard notes" = "cell biology"');
    expect(outline).toContain('text "Flashcard" = "mitochondria"');
    expect(outline).toContain('text "Scorecard" = "ten"');
    expect(outline).toContain('text "Discard" = "pile"');
  });

  it('clips values to 120 chars and caps the outline at 3000 with a truncation marker', () => {
    const long = makeFrame(`<input name="essay" value="${'x'.repeat(300)}">`);
    const line = inspect(long).outline!.split('\n')[1];
    expect(line).toBe(`f1 text "essay" = "${'x'.repeat(120)}"`);

    const many = makeFrame(Array.from({ length: 400 }, (_, i) => `<button>Button number ${i}</button>`).join(''));
    const outline = inspect(many).outline!;
    expect(outline.length).toBeLessThanOrEqual(3000);
    expect(outline.endsWith('\n… (truncated)')).toBe(true);
  });

  it('stamps nothing into the widget DOM', () => {
    const frame = makeFrame(PLANET_QUIZ);
    const before = frame.Doc.body.innerHTML;
    inspect(frame);
    inspect(frame);
    expect(frame.Doc.body.innerHTML).toBe(before);
  });

  it('describes selects, checkboxes, number and editable fields, links and agent-off controls', () => {
    const frame = makeFrame(`
      <select name="planet"><option value="me">Mercury</option><option value="ve" selected>Venus</option></select>
      <label><input type="checkbox" name="toppings" value="olives" checked> Olives</label>
      <input type="number" name="age" value="7">
      <div contenteditable="true" aria-label="Notes">hello</div>
      <a href="#docs">Docs</a>
      <div data-mj-agent="off"><button>Grade</button></div>
    `);
    expect(inspect(frame).outline!.split('\n').slice(1)).toEqual([
      'f1 select "planet" = "Venus" (options: Mercury, Venus)',
      'f2 checkbox "Olives" (group "toppings") = checked',
      'f3 number "age" = 7',
      'f4 editable "Notes" = "hello"',
      'a1 link "Docs"',
      'a2 button "Grade" [not operable]'
    ]);
  });
});

// ───────────────────────────────────────────────────────────── D2 operate

describe('D2: operate', () => {
  it('set uses the prototype setter, so a framework value tracker sees input + change', async () => {
    const frame = makeFrame('<input name="email" value="">');
    const input = el<HTMLInputElement>(frame, 'input');
    const proto = Object.getOwnPropertyDescriptor(frame.Win.HTMLInputElement.prototype, 'value')!;
    let tracked = '';
    // React-style tracker: an own `value` property records what CODE assigned through the instance.
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return proto.get!.call(input); },
      set(v: string) { tracked = v; proto.set!.call(input, v); }
    });
    const seen: string[] = [];
    const listener = (e: Event): void => { seen.push(`${e.type}:${proto.get!.call(input)}:tracked=${tracked}`); };
    input.addEventListener('input', listener);
    input.addEventListener('change', listener);
    const reply = await operate(frame, [{ target: 'email', op: 'set', value: 'ada@example.com' }]);
    expect(reply?.result?.steps).toEqual([{ ok: true }]);
    expect(seen).toEqual(['input:ada@example.com:tracked=', 'change:ada@example.com:tracked=']);
    expect(reply?.result?.outline).toContain('f1 text "email" = "ada@example.com"');
  });

  it('select by option label or value; an unknown option is target_not_found', async () => {
    const frame = makeFrame('<select name="planet"><option value="me">Mercury</option><option value="ve">Venus</option></select>');
    const select = el<HTMLSelectElement>(frame, 'select');
    let changes = 0;
    select.addEventListener('change', () => changes++);
    expect((await operate(frame, [{ target: 'planet', op: 'select', value: 'Venus' }]))?.result?.steps).toEqual([{ ok: true }]);
    expect(select.value).toBe('ve');
    expect((await operate(frame, [{ target: 'planet', op: 'select', value: 'me' }]))?.result?.steps).toEqual([{ ok: true }]);
    expect(select.value).toBe('me');
    expect(changes).toBe(2);
    const [miss] = (await operate(frame, [{ target: 'planet', op: 'select', value: 'Pluto' }]))?.result?.steps ?? [];
    expect(miss).toMatchObject({ ok: false, code: 'target_not_found' });
    expect(miss.error).toContain('Mercury, Venus');
  });

  it('check fires the native events once and is idempotent; uncheck reverses; radios cannot be unchecked', async () => {
    const frame = makeFrame(`
      <label><input type="checkbox" name="agree" value="yes"> I agree</label>
      <label><input type="radio" name="planet" value="Venus"> Venus</label>
    `);
    const box = el<HTMLInputElement>(frame, 'input[type=checkbox]');
    let changes = 0;
    box.addEventListener('change', () => changes++);
    await operate(frame, [{ target: 'I agree', op: 'check' }]);
    expect(box.checked).toBe(true);
    expect(changes).toBe(1);
    await operate(frame, [{ target: 'I agree', op: 'check' }]);
    expect(changes).toBe(1);
    await operate(frame, [{ target: 'I agree', op: 'uncheck' }]);
    expect(box.checked).toBe(false);
    expect(changes).toBe(2);
    const [radio] = (await operate(frame, [{ target: 'Venus', op: 'uncheck' }]))?.result?.steps ?? [];
    expect(radio).toMatchObject({ ok: false, code: 'invalid_args' });
  });

  it('click, focus and editable set', async () => {
    const frame = makeFrame('<button>Go</button><input name="q"><div contenteditable="true" aria-label="Notes"></div>');
    let clicks = 0;
    el(frame, 'button').addEventListener('click', () => clicks++);
    const reply = await operate(frame, [
      { target: 'Go', op: 'click' },
      { target: 'q', op: 'focus' },
      { target: 'Notes', op: 'set', value: 'remember this' }
    ]);
    expect(reply?.result?.steps).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(clicks).toBe(1);
    expect(frame.Doc.activeElement).toBe(el(frame, 'input'));
    expect(el(frame, '[contenteditable]').textContent).toBe('remember this');
  });

  it('a named field reads and targets by its VISIBLE label, and its name still works (E2E finding E2)', async () => {
    const frame = makeFrame('<label>Your name <input name="learner"></label><label>Hypothesis <textarea name="hypothesis">draft</textarea></label><input placeholder="Observation A">');
    const outline = inspect(frame).outline!;
    expect(outline).toContain('text "Your name" = ""');
    expect(outline).toContain('textarea "Hypothesis" = "draft"');
    expect(outline).toContain('text "Observation A" = ""');
    for (const target of ['Your name', 'learner']) {
      expect((await operate(frame, [{ target, op: 'set', value: 'Ada' }]))?.result?.steps?.[0]).toMatchObject({ ok: true });
    }
    expect((await operate(frame, [{ target: 'Observation A', op: 'set', value: 'red' }]))?.result?.steps?.[0]).toMatchObject({ ok: true });
  });

  it('an ambiguous label on a never-inspected document still lists actionable refs (E2E polish)', async () => {
    const frame = makeFrame('<label><input type="radio" name="q2" value="Saturn"> Saturn</label><label><input type="radio" name="q3" value="Saturn"> Saturn</label>');
    const step = (await operate(frame, [{ target: 'Saturn', op: 'check' }]))?.result?.steps?.[0];
    expect(step).toMatchObject({ ok: false, code: 'ambiguous_target' });
    expect(step?.error).toMatch(/f\d+ "Saturn", f\d+ "Saturn"/);
  });

  it('refuses: stale ref, unknown ref, ambiguous label (lists refs), not found, disabled, agent-off, protected', async () => {
    const frame = makeFrame(`
      <button id="old">Old</button>
      <button>Save</button><button>Save</button>
      <button disabled>Locked</button>
      <div data-mj-agent="off"><button>Grade</button></div>
      <input name="cvv" value="1">
    `);
    inspect(frame);
    el(frame, '#old').remove();
    const codeOf = async (step: StepArg): Promise<StepResult | undefined> => (await operate(frame, [step]))?.result?.steps?.[0];
    expect(await codeOf({ target: 'a1', op: 'click' })).toMatchObject({ code: 'stale_ref' });
    expect(await codeOf({ target: 'a9', op: 'click' })).toMatchObject({ code: 'stale_ref' });
    const ambiguous = await codeOf({ target: 'Save', op: 'click' });
    expect(ambiguous).toMatchObject({ ok: false, code: 'ambiguous_target' });
    expect(ambiguous?.error).toMatch(/a\d+ "Save", a\d+ "Save"/);
    expect(await codeOf({ target: 'Nope', op: 'click' })).toMatchObject({ code: 'target_not_found' });
    expect(await codeOf({ target: 'Locked', op: 'click' })).toMatchObject({ code: 'disabled' });
    expect(await codeOf({ target: 'Grade', op: 'click' })).toMatchObject({ code: 'not_operable' });
    expect(await codeOf({ target: 'cvv', op: 'set', value: '2' })).toMatchObject({ code: 'not_operable' });
    expect(el<HTMLInputElement>(frame, 'input').value).toBe('1');
  });

  it('a CSS selector is the last resort target', async () => {
    const frame = makeFrame('<button id="b1">One</button><button id="b2">Two</button>');
    let clicked = '';
    frame.Doc.body.addEventListener('click', (e) => { clicked = (e.target as HTMLElement).id; });
    await operate(frame, [{ target: '#b2', op: 'click' }]);
    expect(clicked).toBe('b2');
  });

  it('configure({ agentOperable:false }) refuses the whole command; bad step lists are invalid_args', async () => {
    const frame = makeFrame('<button>Go</button>');
    expect((await operate(frame, []))).toMatchObject({ ok: false, code: 'invalid_args' });
    const six = Array.from({ length: 6 }, () => ({ target: 'Go', op: 'click' }));
    expect((await operate(frame, six))).toMatchObject({ ok: false, code: 'invalid_args' });
    expect((await operate(frame, [{ target: 'Go', op: 'explode' }]))).toMatchObject({ ok: false, code: 'invalid_args' });
    frame.Win.MJWhiteboard.configure({ agentOperable: false });
    expect((await operate(frame, [{ target: 'Go', op: 'click' }]))).toMatchObject({ ok: false, code: 'not_operable' });
    expect(replyTo(frame, send(frame, 'inspect'))).toMatchObject({ ok: true });
  });

  it('yields a macrotask between steps and re-resolves each target when it runs', async () => {
    const frame = makeFrame('<div id="stage"><button>Next</button></div>');
    let answered = 0;
    el(frame, 'button').addEventListener('click', () => {
      setTimeout(() => {
        el(frame, '#stage').innerHTML = '<button>Answer B</button>';
        el(frame, '#stage button').addEventListener('click', () => answered++);
      }, 0);
    });
    const reply = await operate(frame, [{ target: 'Next', op: 'click' }, { target: 'Answer B', op: 'click' }]);
    expect(reply?.result?.steps).toEqual([{ ok: true }, { ok: true }]);
    expect(answered).toBe(1);
    expect(reply?.result?.outline).toContain('a1 button "Answer B"');
  });

  it('stops at the first failing step', async () => {
    const frame = makeFrame('<button>Go</button>');
    let clicks = 0;
    el(frame, 'button').addEventListener('click', () => clicks++);
    const reply = await operate(frame, [{ target: 'Nope', op: 'click' }, { target: 'Go', op: 'click' }]);
    expect(reply?.result?.steps).toHaveLength(1);
    expect(clicks).toBe(0);
  });

  it('draws a pointer-events:none feedback ring in ringColor for ~800 ms; no transition under reduced motion', async () => {
    const frame = makeFrame('<button>Go</button>');
    const ringOf = (): HTMLElement | undefined =>
      Array.from(frame.Doc.body.querySelectorAll<HTMLElement>('div[aria-hidden="true"]')).find((d) => d.style.pointerEvents === 'none');
    send(frame, 'operate', { steps: [{ target: 'Go', op: 'click' }], ringColor: '#123456' });
    const ring = ringOf();
    expect(ring).toBeDefined();
    expect(ring!.style.borderColor || ring!.style.border).toMatch(/#123456|rgb\(18, 52, 86\)/);
    expect(ring!.style.transition).toContain('opacity');
    await vi.advanceTimersByTimeAsync(900);
    expect(ringOf()).toBeUndefined();

    const calm = makeFrame('<button>Go</button>');
    Object.defineProperty(calm.Win, 'matchMedia', { configurable: true, value: (q: string) => ({ matches: true, media: q }) });
    send(calm, 'operate', { steps: [{ target: 'Go', op: 'click' }], ringColor: '#123456' });
    const still = Array.from(calm.Doc.body.querySelectorAll<HTMLElement>('div[aria-hidden="true"]')).find((d) => d.style.pointerEvents === 'none');
    expect(still).toBeDefined();
    expect(still!.style.transition).toBe('');
    await vi.advanceTimersByTimeAsync(900);
  });

  it('settles on timers so an auto-submit lands in `submitted`, tagged by:agent', async () => {
    const frame = makeFrame('<input name="answer" value="Venus"><button type="button">Submit</button>');
    const reply = await operate(frame, [{ target: 'Submit', op: 'click' }]);
    expect(reply?.result?.submitted).toEqual({ __auto: true, trigger: 'Submit', fields: { answer: 'Venus' } });
    expect(submits(frame)).toHaveLength(1);
    expect(submits(frame)[0].by).toBe('agent');
  });
});

// ───────────────────────────────────────────────────────────── D3 author tagging

describe('D3: author tagging', () => {
  it('an untrusted click OUTSIDE the agent window is the user (no `by`)', async () => {
    const frame = makeFrame('<button aria-label="Hint">?</button>');
    el(frame, 'button').click();
    await vi.advanceTimersByTimeAsync(1600);
    expect(batches(frame)).toHaveLength(1);
    expect(batches(frame)[0].by).toBeUndefined();
  });

  it('the agent window covers the command plus 750 ms: widget code clicking at +500 is agent, at +1000 user', async () => {
    const frame = makeFrame('<button>Go</button><button aria-label="Echo">E</button>');
    await operate(frame, [{ target: 'Go', op: 'click' }]); // window ends ~750 ms after the reply
    const opBatches = batches(frame);
    expect(opBatches).toHaveLength(1);
    expect(opBatches[0]).toMatchObject({ by: 'agent', events: [{ kind: 'click', target: 'Go' }] });
    await vi.advanceTimersByTimeAsync(300);
    el(frame, '[aria-label=Echo]').click(); // still inside the window
    await vi.advanceTimersByTimeAsync(700);
    el(frame, '[aria-label=Echo]').click(); // outside
    await vi.advanceTimersByTimeAsync(1600);
    const echoes = batches(frame).slice(1);
    expect(echoes.map((b) => b.by ?? 'user')).toEqual(['agent', 'user']);
  });

  it('a TRUSTED event inside the window is the user; batches never mix authors', async () => {
    const frame = makeFrame('<input name="city">');
    const gate = deferred();
    frame.Win.MJWhiteboard.onAction('wait', () => gate.Promise);
    const id = send(frame, 'call', { action: 'wait', payload: null });
    const input = el<HTMLInputElement>(frame, 'input');
    input.focus(); // jsdom fires a TRUSTED focusin
    input.dispatchEvent(new frame.Win.FocusEvent('focusin', { bubbles: true })); // untrusted, in window
    gate.Resolve('done');
    await vi.advanceTimersByTimeAsync(2000);
    expect(replyTo(frame, id)).toMatchObject({ ok: true, result: { result: 'done' } });
    expect(batches(frame).map((b) => [b.by ?? 'user', b.events!.length])).toEqual([['user', 1], ['agent', 1]]);
  });

  it('a typing record is tagged at EVENT time even though it is pushed 800 ms later (after the window)', async () => {
    const frame = makeFrame('<input name="city">');
    const gate = deferred();
    frame.Win.MJWhiteboard.onAction('wait', () => gate.Promise);
    send(frame, 'call', { action: 'wait', payload: null });
    const input = el<HTMLInputElement>(frame, 'input');
    input.value = 'Paris';
    input.dispatchEvent(new frame.Win.Event('input', { bubbles: true }));
    gate.Resolve(null);
    await vi.advanceTimersByTimeAsync(0); // window now ends 750 ms from here; the record pushes at 800
    await vi.advanceTimersByTimeAsync(2500);
    const typing = batches(frame).find((b) => b.events!.some((e) => e.kind === 'input'));
    expect(typing).toMatchObject({ by: 'agent', events: [{ kind: 'input', target: 'city', value: 'Paris' }] });
  });

  it('operate check: the trusted change jsdom fires from the click is still the agent (step cascade)', async () => {
    const frame = makeFrame('<label><input type="checkbox" name="agree"> I agree</label>');
    await operate(frame, [{ target: 'I agree', op: 'check' }]);
    await vi.advanceTimersByTimeAsync(2000);
    const change = batches(frame).find((b) => b.events!.some((e) => e.kind === 'change'));
    expect(change?.by).toBe('agent');
  });

  it('widget code clicking a checkbox inside the window (after an await) is the agent, including its trusted change', async () => {
    const frame = makeFrame('<label><input type="checkbox" name="agree"> I agree</label>');
    frame.Win.MJWhiteboard.onAction('tick', async () => {
      await Promise.resolve();
      el<HTMLInputElement>(frame, 'input').click();
      return true;
    });
    await call(frame, 'tick');
    await vi.advanceTimersByTimeAsync(2000);
    const events = batches(frame).flatMap((b) => b.events!.map((e) => `${e.kind}:${b.by ?? 'user'}`));
    expect(events).toContain('change:agent');
    expect(events.every((e) => e.endsWith(':agent'))).toBe(true);
  });

  it('explicit MJWhiteboard.submit: agent inside the window after an untrusted click, user outside', async () => {
    const frame = makeFrame('<button>Send it</button>');
    el(frame, 'button').addEventListener('click', () => frame.Win.MJWhiteboard.submit({ via: 'widget' }));
    frame.Win.MJWhiteboard.onAction('press', () => { el(frame, 'button').click(); return null; });
    await call(frame, 'press');
    await vi.advanceTimersByTimeAsync(2000);
    el(frame, 'button').click();
    await vi.advanceTimersByTimeAsync(400);
    const explicit = submits(frame).filter((s) => JSON.stringify(s.data) === '{"via":"widget"}');
    expect(explicit.map((s) => s.by ?? 'user')).toEqual(['agent', 'user']);
  });

  it('a TRUSTED form submit inside the window stays the user (auto-submit and explicit submit)', async () => {
    const frame = makeFrame('<form><input name="answer" value="Mars"></form>');
    const form = el<HTMLFormElement>(frame, 'form');
    form.addEventListener('submit', () => frame.Win.MJWhiteboard.submit({ explicit: true }));
    const gate = deferred();
    frame.Win.MJWhiteboard.onAction('wait', () => gate.Promise);
    send(frame, 'call', { action: 'wait', payload: null });
    form.requestSubmit(); // jsdom fires a TRUSTED submit
    gate.Resolve(null);
    await vi.advanceTimersByTimeAsync(400);
    expect(submits(frame).length).toBeGreaterThanOrEqual(1);
    expect(submits(frame).every((s) => s.by === undefined)).toBe(true);
  });

  it('an auto-submit captures the tag when the click schedules it', async () => {
    const frame = makeFrame('<input name="answer" value="Venus"><button type="button">Check answer</button>');
    frame.Win.MJWhiteboard.onAction('grade', () => { el(frame, 'button').click(); return null; });
    await call(frame, 'grade');
    await vi.advanceTimersByTimeAsync(300);
    expect(submits(frame)).toHaveLength(1);
    expect(submits(frame)[0]).toMatchObject({ by: 'agent', data: { __auto: true, fields: { answer: 'Venus' } } });
  });
});

// ───────────────────────────────────────────────────────────── D5 actions

describe('D5: actions', () => {
  it('validates names and the 30-action cap; announces changes debounced once ready', async () => {
    const frame = makeFrame('<p>x</p>');
    const mj = frame.Win.MJWhiteboard;
    const warn = vi.spyOn(frame.Win.console, 'warn').mockImplementation(() => undefined);
    expect(mj.onAction('1abc', () => null)).toBe(false);
    expect(mj.onAction('has space', () => null)).toBe(false);
    expect(mj.onAction('x'.repeat(41), () => null)).toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(mj.onAction('next', () => null, 'Next question')).toBe(true);
    expect(mj.onAction('reset-all', () => null)).toBe(true);
    await vi.advanceTimersByTimeAsync(150);
    const announced = frame.Posted.filter((m) => m.__mjWhiteboardActions === true);
    expect(announced).toHaveLength(1);
    expect(announced[0].actions).toEqual([{ name: 'next', description: 'Next question' }, { name: 'reset-all' }]);
    for (let i = 0; i < 28; i++) {
      expect(mj.onAction(`a${i}`, () => null)).toBe(true);
    }
    expect(mj.onAction('one_more', () => null)).toBe(false);
    expect(mj.offAction('next')).toBe(true);
    await vi.advanceTimersByTimeAsync(150);
    const last = frame.Posted.filter((m) => m.__mjWhiteboardActions === true).pop();
    expect(last?.actions?.map((a) => a.name)).not.toContain('next');
    expect(last?.actions).toHaveLength(29);
  });

  it('call: sync, async, payload, undefined → null', async () => {
    const frame = makeFrame('<p>x</p>');
    const mj = frame.Win.MJWhiteboard;
    mj.onAction('echo', (p) => ({ got: p }));
    mj.onAction('later', async () => 'async value');
    mj.onAction('nothing', () => undefined);
    expect((await call(frame, 'echo', { n: 2 }))).toMatchObject({ ok: true, result: { result: { got: { n: 2 } } } });
    expect((await call(frame, 'later'))).toMatchObject({ ok: true, result: { result: 'async value' } });
    expect((await call(frame, 'nothing'))).toMatchObject({ ok: true, result: { result: null } });
  });

  it('call: throw / reject → action_failed with the message; unknown → unknown_action listing names', async () => {
    const frame = makeFrame('<p>x</p>');
    const mj = frame.Win.MJWhiteboard;
    mj.onAction('boom', () => { throw new Error('kaput'); });
    mj.onAction('reject', () => Promise.reject(new Error('nope')));
    expect(await call(frame, 'boom')).toMatchObject({ ok: false, code: 'action_failed', error: 'kaput' });
    expect(await call(frame, 'reject')).toMatchObject({ ok: false, code: 'action_failed', error: 'nope' });
    const unknown = await call(frame, 'missing');
    expect(unknown).toMatchObject({ ok: false, code: 'unknown_action' });
    expect(unknown?.error).toContain('boom, reject');
  });

  it('call: unserializable or oversize results are action_failed; agentOperable:false refuses', async () => {
    const frame = makeFrame('<p>x</p>');
    const mj = frame.Win.MJWhiteboard;
    mj.onAction('circular', () => { const o: { self?: object } = {}; o.self = o; return o; });
    mj.onAction('huge', () => 'y'.repeat(9000));
    expect(await call(frame, 'circular')).toMatchObject({ ok: false, code: 'action_failed' });
    expect(await call(frame, 'huge')).toMatchObject({ ok: false, code: 'action_failed' });
    mj.configure({ agentOperable: false });
    expect(await call(frame, 'huge')).toMatchObject({ ok: false, code: 'not_operable' });
  });
});

// ───────────────────────────────────────────────────────────── D5 state

describe('D5: declared state and onRestore', () => {
  it('onRestore registered first fires exactly once, on arrival, with the declared state', async () => {
    const restored: Json[] = [];
    const frame = makeFrame('<p>x</p>', { Setup: (mj) => mj.onRestore((s) => restored.push(s)) });
    send(frame, 'restoreState', { state: JSON.stringify({ declared: { q: 2 }, fields: null, answered: null }) });
    await vi.advanceTimersByTimeAsync(0);
    send(frame, 'restoreState', { state: JSON.stringify({ declared: { q: 9 }, fields: null, answered: null }) });
    await vi.advanceTimersByTimeAsync(5000);
    expect(restored).toEqual([{ q: 2 }]);
  });

  it('a restore that arrived BEFORE onRestore is delivered on a microtask after registration', async () => {
    const frame = makeFrame('<p>x</p>');
    send(frame, 'restoreState', { state: JSON.stringify({ declared: 'saved', fields: null, answered: null }) });
    const restored: Json[] = [];
    frame.Win.MJWhiteboard.onRestore((s) => restored.push(s));
    expect(restored).toEqual([]);
    await Promise.resolve();
    await Promise.resolve();
    expect(restored).toEqual(['saved']);
  });

  it('with no MJ host, onRestore fires with null 3 s after ready — once', async () => {
    const restored: Json[] = [];
    makeFrame('<p>x</p>', { Setup: (mj) => mj.onRestore((s) => restored.push(s)) });
    await vi.advanceTimersByTimeAsync(2990);
    expect(restored).toEqual([]);
    await vi.advanceTimersByTimeAsync(20);
    expect(restored).toEqual([null]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(restored).toEqual([null]);
  });

  it('setState is held until the restore; load-time defaults never clobber saved state; debounced 500 ms', async () => {
    const frame = makeFrame('<p>x</p>', {
      Setup: (mj) => { mj.onRestore(() => undefined); mj.setState({ q: 0 }); }
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(states(frame)).toEqual([]);
    send(frame, 'restoreState', { state: JSON.stringify({ declared: { q: 3 }, fields: null, answered: null }) });
    await vi.advanceTimersByTimeAsync(1000);
    expect(states(frame)).toEqual([]); // the held default was discarded, not posted
    frame.Win.MJWhiteboard.setState({ q: 4 });
    frame.Win.MJWhiteboard.setState({ q: 5 });
    await vi.advanceTimersByTimeAsync(499);
    expect(states(frame)).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
    expect(states(frame)).toEqual([{ declared: { q: 5 }, fields: null, answered: null }]);
  });

  it('pre-restore writes ARE posted when there was nothing saved', async () => {
    const frame = makeFrame('<p>x</p>', { Setup: (mj) => { mj.onRestore(() => undefined); mj.setState({ q: 0 }); } });
    send(frame, 'restoreState', { state: null });
    await vi.advanceTimersByTimeAsync(600);
    expect(states(frame)).toEqual([{ declared: { q: 0 }, fields: null, answered: null }]);
  });

  it('oversize state is refused with a console warning, never clipped', async () => {
    const frame = makeFrame('<p>x</p>', { Setup: (mj) => mj.onRestore(() => undefined) });
    const warn = vi.spyOn(frame.Win.console, 'warn').mockImplementation(() => undefined);
    send(frame, 'restoreState', { state: null });
    frame.Win.MJWhiteboard.setState({ blob: 'z'.repeat(5000) });
    await vi.advanceTimersByTimeAsync(600);
    expect(states(frame)).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});

describe('D5/D13: automatic form state', () => {
  const FORM = `
    <input name="name" value="">
    <input type="password" name="pw" value="">
    <input type="hidden" name="token" value="t">
    <input name="cvv" value="">
    <label><input type="checkbox" name="toppings" value="olives"> Olives</label>
    <label><input type="checkbox" name="toppings" value="basil"> Basil</label>
    <label><input type="radio" name="planet" value="Mercury"> Mercury</label>
    <label><input type="radio" name="planet" value="Venus"> Venus</label>
    <button type="button" id="send">Send</button>
  `;

  function type(frame: Frame, selector: string, value: string): void {
    const input = el<HTMLInputElement>(frame, selector);
    input.value = value;
    input.dispatchEvent(new frame.Win.Event('input', { bubbles: true }));
  }

  it('captures form fields (never password / hidden / protected) after the restore, debounced', async () => {
    const frame = makeFrame(FORM);
    send(frame, 'restoreState', { state: null });
    type(frame, 'input[name=name]', 'Ada');
    type(frame, 'input[name=pw]', 'secret');
    type(frame, 'input[name=cvv]', '123');
    el<HTMLInputElement>(frame, 'input[value=olives]').click();
    await vi.advanceTimersByTimeAsync(600);
    const all = states(frame);
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual({
      declared: null,
      fields: { name: 'Ada', toppings: ['olives'], planet: null },
      answered: null
    });
  });

  it('records the last submit as `answered`, shown in the inspect header and result', async () => {
    const frame = makeFrame(FORM);
    send(frame, 'restoreState', { state: null });
    frame.Win.MJWhiteboard.submit({ planet: 'Venus' });
    await vi.advanceTimersByTimeAsync(600);
    const [envelope] = states(frame);
    expect(envelope.answered?.data).toEqual({ planet: 'Venus' });
    const result = inspect(frame);
    expect(result.answered).toEqual(envelope.answered);
    expect(result.outline!.split('\n')[0]).toContain(`answered ${new Date(envelope.answered!.at).toISOString()}`);
  });

  it('restores existing fields silently: widget listeners re-sync, but no notes, no submits, no state echo', async () => {
    const frame = makeFrame(FORM);
    const seen: string[] = [];
    frame.Doc.addEventListener('input', (e) => seen.push(`input:${(e.target as HTMLInputElement).name}`));
    frame.Doc.addEventListener('change', (e) => seen.push(`change:${(e.target as HTMLInputElement).name}`));
    frame.Doc.addEventListener('change', () => frame.Win.MJWhiteboard.submit({ echo: true }));
    const answered = { at: 1700000000000, data: { planet: 'Venus' } };
    send(frame, 'restoreState', {
      state: JSON.stringify({
        declared: null,
        fields: { name: 'Ada', toppings: ['basil'], planet: 'Venus', gone: 'ignored', pw: 'nope' },
        answered
      })
    });
    expect(el<HTMLInputElement>(frame, 'input[name=name]').value).toBe('Ada');
    expect(el<HTMLInputElement>(frame, 'input[value=basil]').checked).toBe(true);
    expect(el<HTMLInputElement>(frame, 'input[value=olives]').checked).toBe(false);
    expect(el<HTMLInputElement>(frame, 'input[value=Venus]').checked).toBe(true);
    expect(el<HTMLInputElement>(frame, 'input[name=pw]').value).toBe('');
    expect(seen).toEqual(expect.arrayContaining(['input:name', 'change:name', 'change:toppings', 'change:planet']));
    await vi.advanceTimersByTimeAsync(3000);
    expect(batches(frame)).toEqual([]);
    expect(submits(frame)).toEqual([]);
    expect(states(frame)).toEqual([]);
    expect(inspect(frame).answered).toEqual(answered);
  });

  it('opt-outs: data-mj-keep-live, configure({ autoState:false }), and a widget with onRestore', async () => {
    const saved = JSON.stringify({ declared: { step: 2 }, fields: { name: 'Ada' }, answered: null });

    const keepLive = makeFrame(FORM);
    keepLive.Doc.body.setAttribute('data-mj-keep-live', '');
    send(keepLive, 'restoreState', { state: saved });
    type(keepLive, 'input[name=name]', 'Bob');
    await vi.advanceTimersByTimeAsync(600);
    expect(states(keepLive)).toEqual([]);

    const configured = makeFrame(FORM, { Setup: (mj) => mj.configure({ autoState: false }) });
    send(configured, 'restoreState', { state: saved });
    expect(el<HTMLInputElement>(configured, 'input[name=name]').value).toBe('');

    const restored: Json[] = [];
    const owner = makeFrame(FORM, { Setup: (mj) => mj.onRestore((s) => restored.push(s)) });
    send(owner, 'restoreState', { state: saved });
    await vi.advanceTimersByTimeAsync(0);
    expect(restored).toEqual([{ step: 2 }]);
    expect(el<HTMLInputElement>(owner, 'input[name=name]').value).toBe('');
  });

  it('oversize automatic state drops `fields` first and keeps the declared state', async () => {
    const frame = makeFrame('<textarea name="a"></textarea><textarea name="b"></textarea><textarea name="c"></textarea><textarea name="d"></textarea><textarea name="e"></textarea>');
    send(frame, 'restoreState', { state: null });
    frame.Win.MJWhiteboard.setState({ keep: true });
    for (const n of ['a', 'b', 'c', 'd', 'e']) {
      const area = el<HTMLTextAreaElement>(frame, `textarea[name=${n}]`);
      area.value = n.repeat(1000);
      area.dispatchEvent(new frame.Win.Event('input', { bubbles: true }));
    }
    await vi.advanceTimersByTimeAsync(600);
    expect(states(frame).pop()).toEqual({ declared: { keep: true }, fields: null, answered: null });
  });
});

// ───────────────────────────────────────────────────────────── F1 privacy + keying hardening

describe('F1: protected values never leave the frame; auto state keys are unique', () => {
  function type(frame: Frame, selector: string, value: string): void {
    const input = el<HTMLInputElement>(frame, selector);
    input.value = value;
    input.dispatchEvent(new frame.Win.Event('input', { bubbles: true }));
    input.dispatchEvent(new frame.Win.Event('change', { bubbles: true }));
  }

  function allPosted(frame: Frame): string {
    return JSON.stringify(frame.Posted);
  }

  it('protected names: _ / camelCase / caps forms are redacted; look-alike words are not', () => {
    const secret = ['user_ssn', 'ssnLast4', 'otp_code', 'otpCode', 'cc_number', 'ccnum', 'pin', 'PIN code',
      'Security code', 'cvn', 'csc', 'iban', 'Routing number', 'accountNumber', 'cc_no', 'CC num'];
    const plain = ['Flashcard', 'Flashcard notes', 'Scorecard', 'Discard', 'Spinner', 'Pinned', 'Opinion'];
    const html = secret.map((n, i) => `<input name="${n}" value="SECRET${i}X">`).join('')
      + plain.map((n, i) => `<input name="${n}" value="plain${i}">`).join('');
    const outline = inspect(makeFrame(html)).outline!;
    expect(outline).not.toMatch(/SECRET\d+X/);
    expect(outline.match(/\[REDACTED, not writable\]/g)).toHaveLength(secret.length);
    plain.forEach((n, i) => expect(outline).toContain(`text "${n}" = "plain${i}"`));
  });

  it('a "Check" auto-submit never carries a protected value into submitted, answered or saved state', async () => {
    const frame = makeFrame(`
      <label>Card number <input name="cc_number"></label>
      <label>Answer <input name="answer"></label>
      <button type="button">Check</button>
    `);
    send(frame, 'restoreState', { state: null });
    type(frame, 'input[name=cc_number]', '4111111111111111');
    type(frame, 'input[name=answer]', 'Venus');
    const reply = await operate(frame, [{ target: 'Check', op: 'click' }]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(reply?.result?.submitted).toMatchObject({ __auto: true, fields: { answer: 'Venus' } });
    expect(allPosted(frame)).not.toContain('4111');
    const last = states(frame).pop()!;
    expect(last.answered?.data).toMatchObject({ fields: { answer: 'Venus' } });
    expect(JSON.stringify(inspect(frame))).not.toContain('4111');
  });

  it('an explicit submit naming a protected field keeps it out of answered and submitted', async () => {
    const frame = makeFrame('<label>Card number <input name="cc_number"></label><button>Go</button>');
    frame.Doc.querySelector('button')!.addEventListener('click', () =>
      frame.Win.MJWhiteboard.submit({ cc_number: '4111', 'Card number': '4111', otpCode: '9', answer: 'ok' }));
    send(frame, 'restoreState', { state: null });
    const reply = await operate(frame, [{ target: 'Go', op: 'click' }]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(reply?.result?.submitted).toEqual({ answer: 'ok' });
    expect(states(frame).pop()?.answered?.data).toEqual({ answer: 'ok' });
  });

  it('an explicit submit keeps keys of hidden (non-secret) fields and ordinary keys', async () => {
    const frame = makeFrame('<input type="hidden" name="questionId" value="q7"><input name="answer">');
    send(frame, 'restoreState', { state: null });
    frame.Win.MJWhiteboard.submit({ questionId: 'q7', answer: 'ok' });
    await vi.advanceTimersByTimeAsync(600);
    expect(states(frame).pop()?.answered?.data).toEqual({ questionId: 'q7', answer: 'ok' });
  });

  it('the ambient recorder records no change / input values for protected fields', async () => {
    const frame = makeFrame('<label>Card number <input name="cc_number"></label><input name="otpCode"><input name="answer">');
    type(frame, 'input[name=cc_number]', '4111');
    type(frame, 'input[name=otpCode]', '987654');
    type(frame, 'input[name=answer]', 'Mars');
    await vi.advanceTimersByTimeAsync(3000);
    const events = batches(frame).flatMap((b) => b.events ?? []);
    expect(events.filter((e) => e.kind === 'change' || e.kind === 'input').map((e) => e.target)).toEqual(['answer']);
    expect(allPosted(frame)).not.toContain('4111');
    expect(allPosted(frame)).not.toContain('987654');
  });

  it('unlabeled and same-label fields get unique keys that restore into the right field', async () => {
    const html = `
      <input placeholder="Mars"><input placeholder="Venus">
      <label>Answer <input class="a1"></label><label>Answer <input class="a2"></label>
    `;
    const first = makeFrame(html);
    send(first, 'restoreState', { state: null });
    type(first, 'input[placeholder=Mars]', 'red');
    type(first, 'input[placeholder=Venus]', 'hot');
    type(first, 'input.a1', 'one');
    type(first, 'input.a2', 'two');
    await vi.advanceTimersByTimeAsync(600);
    const saved = first.Posted.filter((m) => m.__mjWhiteboardState === true).pop()!.state!;
    const keys = Object.keys(JSON.parse(saved).fields);
    expect(new Set(keys).size).toBe(4);

    const second = makeFrame(html);
    send(second, 'restoreState', { state: saved });
    expect(el<HTMLInputElement>(second, 'input[placeholder=Mars]').value).toBe('red');
    expect(el<HTMLInputElement>(second, 'input[placeholder=Venus]').value).toBe('hot');
    expect(el<HTMLInputElement>(second, 'input.a1').value).toBe('one');
    expect(el<HTMLInputElement>(second, 'input.a2').value).toBe('two');
  });

  it('state messages carry the per-document token from ready', async () => {
    const frame = makeFrame('<input name="answer">');
    send(frame, 'restoreState', { state: null });
    type(frame, 'input[name=answer]', 'x');
    await vi.advanceTimersByTimeAsync(600);
    const token = readies(frame)[0].doc;
    const posted = frame.Posted.filter((m) => m.__mjWhiteboardState === true);
    expect(posted.length).toBeGreaterThan(0);
    expect(token).toBeTruthy();
    posted.forEach((m) => expect(m.doc).toBe(token));
  });
});
