import { describe, it, expect } from 'vitest';
import {
  EvaluateWidgetInteractionMessage, InjectWhiteboardSubmitHelper, SummarizeWidgetInteractions,
  WHITEBOARD_INTERACTION_MARKER, WHITEBOARD_INTERACTION_SUMMARY_MAX_CHARS,
  WHITEBOARD_INTERACTION_VALUE_MAX_CHARS, WHITEBOARD_SUBMIT_HELPER,
  WHITEBOARD_WIDGET_INTERACTION_MAX_CHARS, WhiteboardWidgetInteractionRecord
} from '../lib/whiteboard-widget-bridge';
import { WHITEBOARD_TOOL_DEFINITIONS, WHITEBOARD_TOOL_NAMES } from '../lib/whiteboard-tools';

/**
 * AMBIENT WIDGET INTERACTION TELEMETRY: the injected recorder (one script block, riding
 * the existing submit helper), host-side validation of `__mjWhiteboardInteraction`
 * batches (marker / source / shape / size cap), and the pure batch summarizer.
 */

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('recorder injection — ONE script block carries submit + recorder', () => {
  it('the single injected helper contains the recorder (interaction marker + batching + privacy)', () => {
    // exactly ONE <script> element — the recorder extends the submit helper, not a second block
    expect(countOccurrences(WHITEBOARD_SUBMIT_HELPER, '<script>')).toBe(1);
    expect(countOccurrences(WHITEBOARD_SUBMIT_HELPER, '</script>')).toBe(1);
    // posts the documented interaction payload shape
    expect(WHITEBOARD_SUBMIT_HELPER).toContain(WHITEBOARD_INTERACTION_MARKER);
    expect(WHITEBOARD_SUBMIT_HELPER).toContain('__mjWhiteboardInteraction:true,events:batch');
    // privacy: password/hidden fields are skipped entirely, values truncated to 120
    expect(WHITEBOARD_SUBMIT_HELPER).toContain(`'password'`);
    expect(WHITEBOARD_SUBMIT_HELPER).toContain(`'hidden'`);
    expect(WHITEBOARD_SUBMIT_HELPER).toContain('VALUE_MAX=120');
    // batching + debounce constants ride in the script
    expect(WHITEBOARD_SUBMIT_HELPER).toContain('FLUSH_MS=1500');
    expect(WHITEBOARD_SUBMIT_HELPER).toContain('FLUSH_AT=12');
    expect(WHITEBOARD_SUBMIT_HELPER).toContain('TYPE_MS=800');
    // resilience: handlers are try/catch wrapped so recorder errors never leak to widget code
    expect(countOccurrences(WHITEBOARD_SUBMIT_HELPER, 'try{')).toBeGreaterThanOrEqual(5);
  });

  it('injection stays idempotent with the extended helper — exactly once, repeat-safe', () => {
    const once = InjectWhiteboardSubmitHelper('<p>x</p>');
    const thrice = InjectWhiteboardSubmitHelper(InjectWhiteboardSubmitHelper(once));
    expect(countOccurrences(thrice, WHITEBOARD_SUBMIT_HELPER)).toBe(1);
    expect(thrice).toBe(once);
    expect(countOccurrences(thrice, '<script>')).toBe(1);
  });

  it('recorder listens passively at the document level (click/change/input/focusin/focusout)', () => {
    for (const eventName of ['click', 'change', 'input', 'focusin', 'focusout']) {
      expect(WHITEBOARD_SUBMIT_HELPER).toContain(`document.addEventListener('${eventName}'`);
    }
    // click noise filter: only buttons / links / labels / role=button / aria-labeled elements
    expect(WHITEBOARD_SUBMIT_HELPER).toContain(`closest('button,a,label,input[type="button"],input[type="submit"],[role="button"],[aria-label]')`);
  });
});

describe('EvaluateWidgetInteractionMessage — host-side validation matrix', () => {
  const widget = { ItemID: 'html-2', Title: 'Vibe picker' };
  const goodEvents: WhiteboardWidgetInteractionRecord[] = [
    { kind: 'click', target: 'Playful pink', tag: 'button' },
    { kind: 'change', target: 'vibe', value: 'pink' }
  ];

  it('accepts a marked, tracked, well-shaped batch and pre-summarizes it', () => {
    const outcome = EvaluateWidgetInteractionMessage(
      { __mjWhiteboardInteraction: true, events: goodEvents }, widget);
    expect(outcome).toEqual({
      Kind: 'interaction',
      Event: { ItemID: 'html-2', Title: 'Vibe picker', Summary: 'clicked "Playful pink"; changed "vibe" to "pink"' }
    });
  });

  it('untitled widgets surface Title as "" (consumers fall back to the item ID)', () => {
    const outcome = EvaluateWidgetInteractionMessage(
      { __mjWhiteboardInteraction: true, events: goodEvents }, { ItemID: 'html-9' });
    expect(outcome.Kind).toBe('interaction');
    if (outcome.Kind === 'interaction') {
      expect(outcome.Event.Title).toBe('');
      expect(outcome.Event.ItemID).toBe('html-9');
    }
  });

  it('REQUIRES the marker — unrelated postMessage traffic drops silently', () => {
    expect(EvaluateWidgetInteractionMessage({ events: goodEvents }, widget))
      .toEqual({ Kind: 'dropped', Reason: 'not-interaction' });
    expect(EvaluateWidgetInteractionMessage('plain string', widget))
      .toEqual({ Kind: 'dropped', Reason: 'not-interaction' });
    expect(EvaluateWidgetInteractionMessage(null, widget))
      .toEqual({ Kind: 'dropped', Reason: 'not-interaction' });
    // marker must be EXACTLY true — truthy lookalikes don't pass
    expect(EvaluateWidgetInteractionMessage({ __mjWhiteboardInteraction: 'true', events: goodEvents }, widget))
      .toEqual({ Kind: 'dropped', Reason: 'not-interaction' });
    // a SUBMIT message is not an interaction message
    expect(EvaluateWidgetInteractionMessage({ __mjWhiteboardSubmit: true, data: 1 }, widget))
      .toEqual({ Kind: 'dropped', Reason: 'not-interaction' });
  });

  it('IGNORES marked batches from a source that is not a tracked widget frame', () => {
    expect(EvaluateWidgetInteractionMessage({ __mjWhiteboardInteraction: true, events: goodEvents }, null))
      .toEqual({ Kind: 'dropped', Reason: 'unknown-source' });
  });

  it('shape-checks the events array — missing/empty/malformed entries drop the batch', () => {
    const bad: unknown[] = [
      { __mjWhiteboardInteraction: true },                                          // no events
      { __mjWhiteboardInteraction: true, events: 'not-an-array' },                  // wrong type
      { __mjWhiteboardInteraction: true, events: [] },                              // empty
      { __mjWhiteboardInteraction: true, events: [{ kind: 'hover', target: 'x' }] },// unknown kind
      { __mjWhiteboardInteraction: true, events: [{ kind: 'click' }] },             // no target
      { __mjWhiteboardInteraction: true, events: [{ kind: 'change', target: 'f', value: 42 }] }, // non-string value
      { __mjWhiteboardInteraction: true, events: [null] },                          // null entry
      { __mjWhiteboardInteraction: true, events: [goodEvents[0], { kind: 'click', target: 7 }] } // one bad apple
    ];
    for (const message of bad) {
      expect(EvaluateWidgetInteractionMessage(message, widget)).toEqual({ Kind: 'dropped', Reason: 'bad-shape' });
    }
  });

  it('DROPS oversize batches (serialized > 6000 chars)', () => {
    const fat: WhiteboardWidgetInteractionRecord[] = Array.from({ length: 60 }, (_, i) => ({
      kind: 'change', target: `field-${i}`, value: 'v'.repeat(WHITEBOARD_INTERACTION_VALUE_MAX_CHARS)
    }));
    expect(JSON.stringify(fat).length).toBeGreaterThan(WHITEBOARD_WIDGET_INTERACTION_MAX_CHARS);
    expect(EvaluateWidgetInteractionMessage({ __mjWhiteboardInteraction: true, events: fat }, widget))
      .toEqual({ Kind: 'dropped', Reason: 'oversize' });
  });
});

describe('SummarizeWidgetInteractions — compact human line', () => {
  it('renders the documented example shape', () => {
    const summary = SummarizeWidgetInteractions([
      { kind: 'click', target: 'Playful pink', tag: 'button' },
      { kind: 'change', target: 'vibe', value: 'pink' },
      { kind: 'input', target: 'email', value: 'a@' }
    ]);
    expect(summary).toBe('clicked "Playful pink"; changed "vibe" to "pink"; typing in "email"');
  });

  it('covers every kind: click / change / typing / focus / blur', () => {
    const summary = SummarizeWidgetInteractions([
      { kind: 'focus', target: 'email' },
      { kind: 'input', target: 'email', value: 'a' },
      { kind: 'blur', target: 'email' },
      { kind: 'change', target: 'subscribe', value: 'checked' },
      { kind: 'click', target: 'Submit', tag: 'button' }
    ]);
    expect(summary).toBe('focused "email"; typing in "email"; left "email"; changed "subscribe" to "checked"; clicked "Submit"');
  });

  it('dedupes CONSECUTIVE same-field typing (latest wins); interleaved fields stay distinct', () => {
    const consecutive = SummarizeWidgetInteractions([
      { kind: 'input', target: 'email', value: 'a' },
      { kind: 'input', target: 'email', value: 'ab' },
      { kind: 'input', target: 'email', value: 'abc' }
    ]);
    expect(consecutive).toBe('typing in "email"');

    const interleaved = SummarizeWidgetInteractions([
      { kind: 'input', target: 'email', value: 'a' },
      { kind: 'input', target: 'name', value: 'b' },
      { kind: 'input', target: 'email', value: 'ab' }
    ]);
    expect(interleaved).toBe('typing in "email"; typing in "name"; typing in "email"');
  });

  it('label-less clicks fall back to the recorded tag; valueless changes stay terse', () => {
    expect(SummarizeWidgetInteractions([{ kind: 'click', target: '', tag: 'a' }])).toBe('clicked a');
    expect(SummarizeWidgetInteractions([{ kind: 'click', target: '' }])).toBe('clicked element');
    expect(SummarizeWidgetInteractions([{ kind: 'change', target: 'color' }])).toBe('changed "color"');
  });

  it('defensively re-truncates values to 120 chars (recorder-side clipping is not trusted)', () => {
    const summary = SummarizeWidgetInteractions([
      { kind: 'change', target: 'notes', value: 'x'.repeat(500) }
    ]);
    expect(summary).toBe(`changed "notes" to "${'x'.repeat(WHITEBOARD_INTERACTION_VALUE_MAX_CHARS)}"`);
  });

  it('caps the whole line at ~300 chars with an ellipsis', () => {
    const many: WhiteboardWidgetInteractionRecord[] = Array.from({ length: 40 }, (_, i) => ({
      kind: 'click', target: `option number ${i}`, tag: 'button'
    }));
    const summary = SummarizeWidgetInteractions(many);
    expect(summary.length).toBe(WHITEBOARD_INTERACTION_SUMMARY_MAX_CHARS);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('short lines are NOT ellipsized', () => {
    expect(SummarizeWidgetInteractions([{ kind: 'focus', target: 'q' }])).toBe('focused "q"');
  });
});

describe('Whiteboard_AddHtml teaches the ambient telemetry', () => {
  it('description says passive forms need no scripting — activity arrives as ambient context', () => {
    const def = WHITEBOARD_TOOL_DEFINITIONS.find((d) => d.Name === WHITEBOARD_TOOL_NAMES.AddHtml)!;
    expect(def.Description).toContain('PASSIVE FORMS NEED NO SCRIPTING');
    expect(def.Description).toContain('ambient');
    // and the explicit-submit teaching is still intact alongside it
    expect(def.Description).toContain('MJWhiteboard.submit(');
  });
});
