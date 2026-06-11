// The starter-widget constant lives in the board component, whose Angular decorators need
// the JIT compiler in this node test environment — load the compiler FIRST.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import {
  EvaluateWidgetSubmitMessage, InjectWhiteboardSubmitHelper, WHITEBOARD_SUBMIT_HELPER,
  WHITEBOARD_SUBMIT_MARKER, WHITEBOARD_WIDGET_SUBMIT_MAX_CHARS
} from '../lib/components/realtime/whiteboard/whiteboard-widget-bridge';
import { WHITEBOARD_WIDGET_STARTER_HTML } from '../lib/components/realtime/whiteboard/whiteboard-board.component';
import { WHITEBOARD_TOOL_DEFINITIONS, WHITEBOARD_TOOL_NAMES } from '../lib/components/realtime/whiteboard/whiteboard-tools';

/**
 * The HTML-widget INPUT BRIDGE (`MJWhiteboard.submit`): helper injection into widget
 * srcdocs (exactly once), host-side message validation (marker required, wrong-source
 * ignored, oversize dropped), the quiz starter document, and the AddHtml tool description
 * that teaches the pattern to the agent.
 */

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('InjectWhiteboardSubmitHelper', () => {
  it('prepends the MJWhiteboard.submit helper to a widget source', () => {
    const out = InjectWhiteboardSubmitHelper('<!doctype html><p>hi</p>');
    expect(out.startsWith(WHITEBOARD_SUBMIT_HELPER)).toBe(true);
    expect(out.endsWith('<!doctype html><p>hi</p>')).toBe(true);
  });

  it('is idempotent — the helper lands EXACTLY once even when applied repeatedly', () => {
    const once = InjectWhiteboardSubmitHelper('<p>x</p>');
    const twice = InjectWhiteboardSubmitHelper(once);
    const thrice = InjectWhiteboardSubmitHelper(twice);
    expect(countOccurrences(thrice, WHITEBOARD_SUBMIT_HELPER)).toBe(1);
    expect(thrice).toBe(once);
  });

  it('widget sources that CALL MJWhiteboard.submit still get the helper (calls ≠ helper)', () => {
    const source = '<button onclick="MJWhiteboard.submit({a:1})">go</button>';
    const out = InjectWhiteboardSubmitHelper(source);
    expect(countOccurrences(out, WHITEBOARD_SUBMIT_HELPER)).toBe(1);
    expect(out).toContain(source);
  });

  it('the helper posts the documented marker payload to the parent with a "*" target', () => {
    // '*' is deliberate: the sandboxed frame has an OPAQUE origin (nothing to address);
    // the HOST validates marker + event.source instead.
    expect(WHITEBOARD_SUBMIT_HELPER).toBe(
      `<script>window.MJWhiteboard={submit:function(data){parent.postMessage({__mjWhiteboardSubmit:true,data:data},'*');}};</script>`);
    expect(WHITEBOARD_SUBMIT_HELPER).toContain(WHITEBOARD_SUBMIT_MARKER);
  });
});

describe('EvaluateWidgetSubmitMessage — host-side validation', () => {
  const widget = { ItemID: 'html-2', Title: 'Quick quiz' };

  it('accepts a marked message from a tracked widget and serializes the data', () => {
    const outcome = EvaluateWidgetSubmitMessage(
      { __mjWhiteboardSubmit: true, data: { answer: 'Mercury', correct: true } }, widget);
    expect(outcome).toEqual({
      Kind: 'submit',
      Event: { ItemID: 'html-2', Title: 'Quick quiz', DataJson: '{"answer":"Mercury","correct":true}' }
    });
  });

  it('untitled widgets surface Title as "" (consumers fall back to the item ID)', () => {
    const outcome = EvaluateWidgetSubmitMessage({ __mjWhiteboardSubmit: true, data: 1 }, { ItemID: 'html-9' });
    expect(outcome).toEqual({ Kind: 'submit', Event: { ItemID: 'html-9', Title: '', DataJson: '1' } });
  });

  it('REQUIRES the marker — unrelated postMessage traffic drops silently', () => {
    expect(EvaluateWidgetSubmitMessage({ data: 'x' }, widget)).toEqual({ Kind: 'dropped', Reason: 'not-submit' });
    expect(EvaluateWidgetSubmitMessage('plain string', widget)).toEqual({ Kind: 'dropped', Reason: 'not-submit' });
    expect(EvaluateWidgetSubmitMessage(null, widget)).toEqual({ Kind: 'dropped', Reason: 'not-submit' });
    expect(EvaluateWidgetSubmitMessage(undefined, widget)).toEqual({ Kind: 'dropped', Reason: 'not-submit' });
    // marker must be EXACTLY true — truthy lookalikes don't pass
    expect(EvaluateWidgetSubmitMessage({ __mjWhiteboardSubmit: 'true', data: 1 }, widget))
      .toEqual({ Kind: 'dropped', Reason: 'not-submit' });
  });

  it('IGNORES marked messages from a source that is not a tracked widget frame', () => {
    const outcome = EvaluateWidgetSubmitMessage({ __mjWhiteboardSubmit: true, data: { spoof: 1 } }, null);
    expect(outcome).toEqual({ Kind: 'dropped', Reason: 'unknown-source' });
  });

  it('DROPS oversize payloads (serialized > 8000 chars) — boundary inclusive', () => {
    const atCap = 'a'.repeat(WHITEBOARD_WIDGET_SUBMIT_MAX_CHARS - 2); // + 2 quote chars = exactly the cap
    const accepted = EvaluateWidgetSubmitMessage({ __mjWhiteboardSubmit: true, data: atCap }, widget);
    expect(accepted.Kind).toBe('submit');

    const overCap = 'a'.repeat(WHITEBOARD_WIDGET_SUBMIT_MAX_CHARS - 1);
    const dropped = EvaluateWidgetSubmitMessage({ __mjWhiteboardSubmit: true, data: overCap }, widget);
    expect(dropped).toEqual({ Kind: 'dropped', Reason: 'oversize' });
  });

  it('drops payloads that cannot be JSON-serialized (undefined data)', () => {
    const outcome = EvaluateWidgetSubmitMessage({ __mjWhiteboardSubmit: true }, widget);
    expect(outcome).toEqual({ Kind: 'dropped', Reason: 'unserializable' });
  });

  it('null data serializes fine ("null") — only undefined is unserializable', () => {
    const outcome = EvaluateWidgetSubmitMessage({ __mjWhiteboardSubmit: true, data: null }, widget);
    expect(outcome).toEqual({ Kind: 'submit', Event: { ItemID: 'html-2', Title: 'Quick quiz', DataJson: 'null' } });
  });
});

describe('starter widget + AddHtml tool description teach the bridge', () => {
  it('the toolbar STARTER widget is a one-question quiz demoing MJWhiteboard.submit', () => {
    expect(WHITEBOARD_WIDGET_STARTER_HTML).toContain('MJWhiteboard.submit(');
    expect(WHITEBOARD_WIDGET_STARTER_HTML).toContain('type="radio"');
    expect(WHITEBOARD_WIDGET_STARTER_HTML).toContain('Submit answer');
    // the starter relies on the HOST-injected helper — it must not redefine it
    expect(WHITEBOARD_WIDGET_STARTER_HTML).not.toContain(WHITEBOARD_SUBMIT_HELPER);
    // and injection lands the helper exactly once
    const injected = InjectWhiteboardSubmitHelper(WHITEBOARD_WIDGET_STARTER_HTML);
    expect(countOccurrences(injected, WHITEBOARD_SUBMIT_HELPER)).toBe(1);
  });

  it('Whiteboard_AddHtml description teaches MJWhiteboard.submit + tutoring usage', () => {
    const def = WHITEBOARD_TOOL_DEFINITIONS.find((d) => d.Name === WHITEBOARD_TOOL_NAMES.AddHtml)!;
    expect(def.Description).toContain('MJWhiteboard.submit(');
    expect(def.Description).toContain('context note');
    expect(def.Description.toLowerCase()).toContain('quiz');
    expect(def.Description).toContain('8000');
    // the original security contract still rides in the description
    expect(def.Description.toLowerCase()).toContain('sandbox');
    expect(def.Description.toLowerCase()).toContain('network');
  });
});
