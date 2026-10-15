import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { WHITEBOARD_SUBMIT_HELPER, WHITEBOARD_SUBMIT_MARKER } from './whiteboard-widget-bridge';

/**
 * The widget INPUT BRIDGE helper, EXECUTED (LXP P19's two bridge defects). The node specs in
 * `__tests__/whiteboard-widget-submit.test.ts` string-match the helper source; this one runs the
 * script against a real (jsdom) document the way a widget frame would, with `parent.postMessage`
 * captured, so the behaviour is pinned rather than the text:
 *
 *  1. The auto-submit click fallback must read the button's type ATTRIBUTE. It read the `type`
 *     PROPERTY, and a `<button>` with no type attribute reports `type === 'submit'`, so clicking
 *     "Show hint" or "Play" forwarded the form 150 ms later and told the agent the user submitted.
 *  2. `collectFields` must keep every ticked box in a checkbox GROUP. It wrote `out[name] =
 *     'checked'` into an object, so two ticked boxes became one `"checked"` with no record of
 *     which — the agent could not react to a multi-select answer, and nothing could restore it.
 */

interface SubmitMessage {
  [WHITEBOARD_SUBMIT_MARKER]?: boolean;
  data?: { __auto?: boolean; trigger?: string; fields?: Record<string, unknown> };
}

const postMessage = vi.fn<(message: SubmitMessage, target: string) => void>();

/** Install the helper ONCE (its listeners are document-level and would double up per test). */
beforeAll(() => {
  const body = WHITEBOARD_SUBMIT_HELPER.replace(/^<script>/, '').replace(/<\/script>$/, '');
  // The frame-side script names `parent` bare; give it ours. window/document/setTimeout are jsdom's.
  new Function('parent', body)({ postMessage });
});

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

/** The explicit-submit payloads the parent received (the ambient interaction batches are filtered out). */
function submissions(): SubmitMessage[] {
  return postMessage.mock.calls.map(([m]) => m).filter((m) => m[WHITEBOARD_SUBMIT_MARKER] === true);
}

describe('widget bridge helper (executed): auto-submit fallback', () => {
  let root: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    postMessage.mockClear();
    (window as unknown as { MJWhiteboard: { __lastSubmitAt: number } }).MJWhiteboard.__lastSubmitAt = 0;
  });

  afterEach(() => {
    root?.remove();
    vi.useRealTimers();
  });

  it('a typeless <button> OUTSIDE any form ("Show hint") does not auto-submit the document', () => {
    root = mount(`
      <input name="answer" value="Mercury">
      <button id="hint">Show hint</button>
    `);
    root.querySelector<HTMLButtonElement>('#hint')!.click();
    vi.advanceTimersByTime(1000);
    expect(submissions()).toEqual([]);
  });

  it('a typeless <button> inside a form whose own handler prevents default ("Play") does not auto-submit', () => {
    root = mount(`
      <form>
        <input name="answer" value="Mercury">
        <button id="play">Play</button>
      </form>
    `);
    const play = root.querySelector<HTMLButtonElement>('#play')!;
    play.addEventListener('click', (e) => e.preventDefault());
    play.click();
    vi.advanceTimersByTime(1000);
    expect(submissions()).toEqual([]);
  });

  it('control: a button whose LABEL is submit-ish still forwards the fields', () => {
    root = mount(`
      <div>
        <input name="answer" value="Mercury">
        <button id="go" type="button">Check answer</button>
      </div>
    `);
    root.querySelector<HTMLButtonElement>('#go')!.click();
    vi.advanceTimersByTime(200);
    const [msg] = submissions();
    expect(msg?.data?.__auto).toBe(true);
    expect(msg?.data?.fields).toEqual({ answer: 'Mercury' });
  });

  it('control: a button with an explicit type="submit" ATTRIBUTE and a neutral label still forwards', () => {
    root = mount(`
      <div>
        <input name="answer" value="Venus">
        <button id="next" type="submit">Next</button>
      </div>
    `);
    root.querySelector<HTMLButtonElement>('#next')!.click();
    vi.advanceTimersByTime(200);
    expect(submissions()[0]?.data?.fields).toEqual({ answer: 'Venus' });
  });
});

describe('widget bridge helper (executed): collectFields', () => {
  let root: HTMLElement;

  beforeEach(() => {
    postMessage.mockClear();
    (window as unknown as { MJWhiteboard: { __lastSubmitAt: number } }).MJWhiteboard.__lastSubmitAt = 0;
  });

  afterEach(() => root?.remove());

  function submitForm(form: HTMLFormElement): Record<string, unknown> | undefined {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return submissions()[0]?.data?.fields;
  }

  it('keeps EVERY ticked box of a checkbox group, as an array of their values', () => {
    root = mount(`
      <form>
        <label><input type="checkbox" name="toppings" value="olives" checked> Olives</label>
        <label><input type="checkbox" name="toppings" value="basil"> Basil</label>
        <label><input type="checkbox" name="toppings" value="chili" checked> Chili</label>
      </form>
    `);
    expect(submitForm(root.querySelector('form')!)).toEqual({ toppings: ['olives', 'chili'] });
  });

  it('a single ticked checkbox is a one-element array too (one stable shape, whatever the count)', () => {
    root = mount(`
      <form>
        <input type="checkbox" name="agree" value="yes" checked>
      </form>
    `);
    expect(submitForm(root.querySelector('form')!)).toEqual({ agree: ['yes'] });
  });

  it('an unticked group contributes nothing', () => {
    root = mount(`
      <form>
        <input type="checkbox" name="toppings" value="olives">
        <input type="text" name="note" value="none">
      </form>
    `);
    expect(submitForm(root.querySelector('form')!)).toEqual({ note: 'none' });
  });

  it('radios are unchanged: the one checked value, as a string', () => {
    root = mount(`
      <form>
        <input type="radio" name="planet" value="Mercury">
        <input type="radio" name="planet" value="Venus" checked>
      </form>
    `);
    expect(submitForm(root.querySelector('form')!)).toEqual({ planet: 'Venus' });
  });
});
