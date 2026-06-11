/**
 * LIVE WHITEBOARD — the HTML-widget INPUT BRIDGE (`MJWhiteboard.submit`).
 *
 * HTML widgets are tutoring-style "illustrate a concept and GET USER INPUT" chunks —
 * micro-forms, HTML+SVG explainers, concept animations, one-question quizzes. They render
 * inside a strictly sandboxed iframe (`sandbox="allow-scripts"` only, opaque origin), so
 * the ONLY way data can flow out is `postMessage`. This module is the Angular-free half of
 * that bridge:
 *
 *  - {@link InjectWhiteboardSubmitHelper} prepends a tiny helper script to every widget's
 *    `srcdoc` (exactly once) that defines `window.MJWhiteboard.submit(data)` — the widget
 *    calls it from a button / form handler and the helper posts the payload to the parent.
 *    The helper targets `'*'` deliberately: the frame runs in an OPAQUE origin, so there is
 *    no concrete origin to name; the HOST side validates the message instead.
 *  - {@link EvaluateWidgetSubmitMessage} is that host-side validation: the marker property
 *    must be present, the `event.source` must resolve to a TRACKED widget iframe (anything
 *    else is dropped), and the serialized payload is capped at
 *    {@link WHITEBOARD_WIDGET_SUBMIT_MAX_CHARS} (oversize → warn + drop).
 *
 * The board component owns the single `window` 'message' listener and emits the accepted
 * submissions as {@link WhiteboardWidgetSubmitEvent}; the channel plugin forwards them to
 * the live agent context as `[whiteboard]` notes.
 */

/** Marker property carried on every bridge postMessage payload. */
export const WHITEBOARD_SUBMIT_MARKER = '__mjWhiteboardSubmit';

/**
 * The helper script prepended to every widget `srcdoc` — defines `MJWhiteboard.submit`.
 * `'*'` as the target origin is acceptable here: the sandboxed frame has an opaque origin
 * (there is nothing else to address), and the HOST validates marker + `event.source`.
 */
export const WHITEBOARD_SUBMIT_HELPER =
  `<script>window.MJWhiteboard={submit:function(data){parent.postMessage({__mjWhiteboardSubmit:true,data:data},'*');}};</script>`;

/** Max serialized payload size (chars) accepted from one `MJWhiteboard.submit` call. */
export const WHITEBOARD_WIDGET_SUBMIT_MAX_CHARS = 8000;

/** One accepted widget submission, surfaced by the board/host `WidgetSubmitted` output. */
export interface WhiteboardWidgetSubmitEvent {
  /** The submitting widget's board item ID (e.g. `html-2`). */
  ItemID: string;
  /** The widget's header title ('' when untitled — consumers fall back to {@link ItemID}). */
  Title: string;
  /** The submitted payload, JSON-serialized (capped at {@link WHITEBOARD_WIDGET_SUBMIT_MAX_CHARS}). */
  DataJson: string;
}

/**
 * BEFORE-event args for the board/host `WidgetSubmitting` output — raised after a
 * widget's `MJWhiteboard.submit` payload passed validation (marker + tracked source +
 * size cap) but BEFORE it is surfaced through `WidgetSubmitted`. Handlers run
 * synchronously; set {@link Cancel} to `true` to drop the submission (no `WidgetSubmitted`
 * fires and nothing reaches the agent/consumer).
 */
export interface WhiteboardWidgetSubmittingEventArgs {
  /** The validated submission about to be surfaced. */
  Event: WhiteboardWidgetSubmitEvent;
  /** Set to `true` (in a synchronous handler) to drop the submission. */
  Cancel: boolean;
}

/** Why an incoming 'message' event was NOT surfaced as a widget submission. */
export type WhiteboardWidgetSubmitDropReason =
  /** Not a bridge message at all (no marker) — other postMessage traffic, ignore silently. */
  | 'not-submit'
  /** Marker present but `event.source` is not a tracked widget iframe — spoof/stale, drop. */
  | 'unknown-source'
  /** Payload serialized beyond the cap — warn + drop. */
  | 'oversize'
  /** Payload could not be JSON-serialized (e.g. `undefined` / function) — drop. */
  | 'unserializable';

/** Outcome of evaluating one window 'message' event against the bridge contract. */
export type WhiteboardWidgetSubmitOutcome =
  | { Kind: 'submit'; Event: WhiteboardWidgetSubmitEvent }
  | { Kind: 'dropped'; Reason: WhiteboardWidgetSubmitDropReason };

/**
 * Prepend the `MJWhiteboard.submit` helper to a widget's HTML source — EXACTLY once.
 * Idempotent: when the helper is already present (re-render of an injected source) the
 * input is returned unchanged, so memoized srcdocs never accumulate duplicate helpers.
 */
export function InjectWhiteboardSubmitHelper(html: string): string {
  if (html.includes(WHITEBOARD_SUBMIT_HELPER)) {
    return html;
  }
  return WHITEBOARD_SUBMIT_HELPER + html;
}

/**
 * Host-side validation of one window 'message' event:
 *
 *  1. the payload must carry the {@link WHITEBOARD_SUBMIT_MARKER} (anything else is
 *     unrelated postMessage traffic — dropped silently as `'not-submit'`);
 *  2. `sourceWidget` is the caller's resolution of `event.source` against its tracked
 *     widget iframes (window → item map) — `null` means the sender is NOT one of the
 *     board's widgets and the message is dropped (`'unknown-source'`);
 *  3. the submitted data is JSON-serialized and capped at
 *     {@link WHITEBOARD_WIDGET_SUBMIT_MAX_CHARS} (`'oversize'` beyond it).
 */
export function EvaluateWidgetSubmitMessage(
  messageData: unknown,
  sourceWidget: { ItemID: string; Title?: string } | null
): WhiteboardWidgetSubmitOutcome {
  if (messageData === null || typeof messageData !== 'object'
    || (messageData as Record<string, unknown>)[WHITEBOARD_SUBMIT_MARKER] !== true) {
    return { Kind: 'dropped', Reason: 'not-submit' };
  }
  if (!sourceWidget) {
    return { Kind: 'dropped', Reason: 'unknown-source' };
  }
  let dataJson: string | undefined;
  try {
    dataJson = JSON.stringify((messageData as Record<string, unknown>)['data']);
  }
  catch {
    dataJson = undefined; // circular payloads can't cross postMessage, but stay defensive
  }
  if (dataJson === undefined) {
    return { Kind: 'dropped', Reason: 'unserializable' };
  }
  if (dataJson.length > WHITEBOARD_WIDGET_SUBMIT_MAX_CHARS) {
    return { Kind: 'dropped', Reason: 'oversize' };
  }
  return {
    Kind: 'submit',
    Event: { ItemID: sourceWidget.ItemID, Title: sourceWidget.Title ?? '', DataJson: dataJson }
  };
}
