/**
 * LIVE WHITEBOARD — the HTML-widget INPUT BRIDGE (`MJWhiteboard.submit`) and the AMBIENT
 * INTERACTION RECORDER.
 *
 * HTML widgets are tutoring-style "illustrate a concept and GET USER INPUT" chunks —
 * micro-forms, HTML+SVG explainers, concept animations, one-question quizzes. They render
 * inside a strictly sandboxed iframe (`sandbox="allow-scripts"` only, opaque origin), so
 * the ONLY way data can flow out is `postMessage`. This module is the Angular-free half of
 * that bridge:
 *
 *  - {@link InjectWhiteboardSubmitHelper} prepends ONE helper script to every widget's
 *    `srcdoc` (exactly once) that defines BOTH halves of the bridge:
 *      1. `window.MJWhiteboard.submit(data)` — the EXPLICIT input path; the widget calls
 *         it from a button / form handler and the helper posts the payload to the parent.
 *      2. The AMBIENT interaction recorder — passive document-level listeners (click /
 *         change / debounced input / focusin / focusout) that observe form activity the
 *         widget author wrote NO script for, batch it, and post it to the parent as a
 *         `__mjWhiteboardInteraction` message. Password / hidden inputs are skipped
 *         entirely; every value is truncated client-side. The recorder is defensive:
 *         every handler is wrapped in try/catch so it can never break widget code.
 *    The helper targets `'*'` deliberately: the frame runs in an OPAQUE origin, so there is
 *    no concrete origin to name; the HOST side validates the message instead.
 *  - {@link EvaluateWidgetSubmitMessage} / {@link EvaluateWidgetInteractionMessage} are
 *    that host-side validation: the marker property must be present, the `event.source`
 *    must resolve to a TRACKED widget iframe (anything else is dropped), the payload is
 *    size-capped (oversize → warn + drop), and interaction batches are shape-checked.
 *  - {@link SummarizeWidgetInteractions} compresses one validated interaction batch into a
 *    compact human line (`clicked "Playful pink"; changed "vibe" to "pink"; typing in
 *    "email"`) — what the channel plugin forwards to the live agent.
 *
 * The board component owns the single `window` 'message' listener and emits accepted
 * submissions as {@link WhiteboardWidgetSubmitEvent} and accepted ambient batches as
 * {@link WhiteboardWidgetInteractionEvent}; the channel plugin forwards them to the live
 * agent context as `[whiteboard]` notes (interaction notes throttled per widget).
 */

/** Marker property carried on every explicit-submit bridge postMessage payload. */
export const WHITEBOARD_SUBMIT_MARKER = '__mjWhiteboardSubmit';

/** Marker property carried on every ambient-interaction bridge postMessage payload. */
export const WHITEBOARD_INTERACTION_MARKER = '__mjWhiteboardInteraction';

/** Max chars an in-widget recorded VALUE keeps (recorder-side truncation, defensive re-clip host-side). */
export const WHITEBOARD_INTERACTION_VALUE_MAX_CHARS = 120;

/** Max chars a recorded element LABEL keeps. */
export const WHITEBOARD_INTERACTION_LABEL_MAX_CHARS = 40;

/** Recorder batch flush interval (ms). */
export const WHITEBOARD_INTERACTION_FLUSH_MS = 1500;

/** Recorder batch flushes immediately at this queue depth. */
export const WHITEBOARD_INTERACTION_FLUSH_AT = 12;

/** Per-field typing debounce inside the recorder (ms). */
export const WHITEBOARD_INTERACTION_TYPE_DEBOUNCE_MS = 800;

/**
 * The ONE helper script prepended to every widget `srcdoc` — defines `MJWhiteboard.submit`
 * (explicit input path) AND installs the passive ambient-interaction recorder.
 * `'*'` as the target origin is acceptable here: the sandboxed frame has an opaque origin
 * (there is nothing else to address), and the HOST validates marker + `event.source`.
 *
 * The recorder, in widget-side terms:
 *  - `click` — buttons / links / labels / role=button / aria-labeled elements only
 *    (body/div noise without a label is ignored); records the tag + best label
 *    (aria-label || name || id || trimmed textContent, ≤40 chars).
 *  - `change` — select / radio / checkbox / text fields: field label + new value
 *    (checkbox → 'checked'/'unchecked').
 *  - `input` — debounced per-field (800 ms): field label + current value.
 *  - `focusin` / `focusout` — field label only.
 *  - PRIVACY: `type="password"` / `type="hidden"` fields are skipped entirely; every
 *    recorded value is truncated to 120 chars BEFORE leaving the frame.
 *  - BATCHING: events queue and flush via postMessage every 1500 ms or at 12 queued.
 *  - RESILIENCE: every handler body is try/catch-wrapped — recorder errors never leak
 *    into widget code.
 *
 * AUTO-SUBMIT FALLBACK: agent-generated widgets don't always wire
 * `MJWhiteboard.submit` — a plain `<form>` submit would NAVIGATE the sandboxed frame
 * (blanking the widget) and an inert Submit button goes nowhere. The helper therefore:
 *  - intercepts every `submit` event (preventDefault — the frame never navigates) and
 *    forwards the form's serialized fields as `{ __auto: true, fields }`;
 *  - watches clicks on submit-ish buttons (type=submit, or labeled submit/send/done/…)
 *    and, shortly after, forwards the nearest form's (or document's) fields the same way;
 *  - DEDUPES: an explicit `MJWhiteboard.submit` (or a prior auto-forward) within 600 ms
 *    suppresses the fallback, so well-built widgets never double-submit.
 *  - Serialization respects the recorder's privacy rules (password/hidden skipped,
 *    values clipped) and only checked radios/checkboxes contribute.
 */
export const WHITEBOARD_SUBMIT_HELPER =
  `<script>window.MJWhiteboard={__lastSubmitAt:0,submit:function(data){window.MJWhiteboard.__lastSubmitAt=Date.now();parent.postMessage({__mjWhiteboardSubmit:true,data:data},'*');}};
(function(){
var VALUE_MAX=120,LABEL_MAX=40,FLUSH_MS=1500,FLUSH_AT=12,TYPE_MS=800;
var queue=[],flushTimer=null,typeTimers={};
function flush(){flushTimer=null;if(!queue.length){return;}var batch=queue;queue=[];try{parent.postMessage({__mjWhiteboardInteraction:true,events:batch},'*');}catch(e){}}
function push(ev){queue.push(ev);if(queue.length>=FLUSH_AT){if(flushTimer){clearTimeout(flushTimer);flushTimer=null;}flush();return;}if(!flushTimer){flushTimer=setTimeout(flush,FLUSH_MS);}}
function clip(v,max){v=String(v==null?'':v);return v.length>max?v.slice(0,max):v;}
function isPrivate(el){var t=(el&&el.type?String(el.type):'').toLowerCase();return t==='password'||t==='hidden';}
function labelOf(el){if(!el||!el.getAttribute){return '';}var v=el.getAttribute('aria-label')||el.getAttribute('name')||el.id;if(v){return clip(v,LABEL_MAX);}var t=(el.textContent||'').replace(/\\s+/g,' ').trim();return t?clip(t,LABEL_MAX):'';}
function fieldLabel(el){var own=labelOf(el);if(own){return own;}try{if(el.labels&&el.labels.length){var lt=(el.labels[0].textContent||'').replace(/\\s+/g,' ').trim();if(lt){return clip(lt,LABEL_MAX);}}var wrap=el.closest?el.closest('label'):null;if(wrap){var wt=(wrap.textContent||'').replace(/\\s+/g,' ').trim();if(wt){return clip(wt,LABEL_MAX);}}}catch(e){}return el.tagName?el.tagName.toLowerCase():'field';}
function isField(el){var t=el&&el.tagName?el.tagName.toUpperCase():'';return t==='INPUT'||t==='TEXTAREA'||t==='SELECT';}
function fieldValue(el){if(el.type==='checkbox'){return el.checked?'checked':'unchecked';}return clip(el.value,VALUE_MAX);}
document.addEventListener('click',function(e){try{var el=e.target&&e.target.closest?e.target.closest('button,a,label,input[type="button"],input[type="submit"],[role="button"],[aria-label]'):null;if(!el){return;}var lbl=labelOf(el);if(!lbl){return;}push({kind:'click',target:lbl,tag:el.tagName.toLowerCase()});}catch(err){}},true);
document.addEventListener('change',function(e){try{var el=e.target;if(!isField(el)||isPrivate(el)){return;}var name=fieldLabel(el);if(typeTimers[name]){clearTimeout(typeTimers[name]);delete typeTimers[name];}push({kind:'change',target:name,value:fieldValue(el)});}catch(err){}},true);
document.addEventListener('input',function(e){try{var el=e.target;if(!isField(el)||isPrivate(el)){return;}var t=(el.type||'').toLowerCase();if(t==='checkbox'||t==='radio'){return;}var name=fieldLabel(el);if(typeTimers[name]){clearTimeout(typeTimers[name]);}typeTimers[name]=setTimeout(function(){delete typeTimers[name];try{push({kind:'input',target:name,value:clip(el.value,VALUE_MAX)});}catch(e2){}},TYPE_MS);}catch(err){}},true);
document.addEventListener('focusin',function(e){try{var el=e.target;if(!isField(el)||isPrivate(el)){return;}push({kind:'focus',target:fieldLabel(el)});}catch(err){}});
document.addEventListener('focusout',function(e){try{var el=e.target;if(!isField(el)||isPrivate(el)){return;}push({kind:'blur',target:fieldLabel(el)});}catch(err){}});
var AUTO_DEDUPE_MS=600;
function collectFields(scope){var out={},els=(scope&&scope.querySelectorAll?scope:document).querySelectorAll('input,select,textarea');for(var i=0;i<els.length;i++){var el=els[i];if(isPrivate(el)){continue;}var t=(el.type||'').toLowerCase();if((t==='radio'||t==='checkbox')&&!el.checked){continue;}var name=fieldLabel(el);if(t==='checkbox'){out[name]='checked';}else{out[name]=clip(el.value,VALUE_MAX);}}return out;}
function autoSubmit(scope,trigger){try{var last=window.MJWhiteboard.__lastSubmitAt||0;if(Date.now()-last<AUTO_DEDUPE_MS){return;}var fields=collectFields(scope);var payload={__auto:true,trigger:clip(trigger||'submit',LABEL_MAX),fields:fields};window.MJWhiteboard.submit(payload);}catch(err){}}
document.addEventListener('submit',function(e){try{e.preventDefault();autoSubmit(e.target,'form');}catch(err){}},true);
document.addEventListener('click',function(e){try{var b=e.target&&e.target.closest?e.target.closest('button,input[type="submit"],input[type="button"]'):null;if(!b){return;}var label=(labelOf(b)||'')+' '+(b.type||'');if(!/submit|send|done|go\\b|answer|check/i.test(label)){return;}setTimeout(function(){autoSubmit(b.form||document,labelOf(b)||'button');},150);}catch(err){}},true);
})();</script>`;

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

// ───────────────────────────────────────────────────────────── ambient interactions

/** Max serialized size (chars) accepted for one ambient interaction BATCH. */
export const WHITEBOARD_WIDGET_INTERACTION_MAX_CHARS = 6000;

/** Max length of one summarized interaction line (see {@link SummarizeWidgetInteractions}). */
export const WHITEBOARD_INTERACTION_SUMMARY_MAX_CHARS = 300;

/** The event kinds the in-widget recorder emits. */
export type WhiteboardWidgetInteractionKind = 'click' | 'change' | 'input' | 'focus' | 'blur';

/** One recorded in-widget interaction, as posted by the injected recorder. */
export interface WhiteboardWidgetInteractionRecord {
  /** What happened. */
  kind: WhiteboardWidgetInteractionKind;
  /** Best label of the interacted element (aria-label || name || id || text, ≤40 chars). */
  target: string;
  /** The field's value after the event (change/input only; checkbox → 'checked'/'unchecked'). */
  value?: string;
  /** The clicked element's tag name (click only). */
  tag?: string;
}

/**
 * One accepted ambient-interaction batch, surfaced by the board/host `WidgetInteraction`
 * output. `Summary` is the compact human line built by {@link SummarizeWidgetInteractions}
 * — what integration layers forward to their agent runtime.
 */
export interface WhiteboardWidgetInteractionEvent {
  /** The widget's board item ID (e.g. `html-2`). */
  ItemID: string;
  /** The widget's header title ('' when untitled — consumers fall back to {@link ItemID}). */
  Title: string;
  /** Compact human summary of the batch (≤{@link WHITEBOARD_INTERACTION_SUMMARY_MAX_CHARS} chars). */
  Summary: string;
}

/** Why an incoming 'message' event was NOT surfaced as an ambient interaction batch. */
export type WhiteboardWidgetInteractionDropReason =
  /** Not an interaction message at all (no marker) — other postMessage traffic, ignore silently. */
  | 'not-interaction'
  /** Marker present but `event.source` is not a tracked widget iframe — spoof/stale, drop. */
  | 'unknown-source'
  /** Serialized batch beyond {@link WHITEBOARD_WIDGET_INTERACTION_MAX_CHARS} — warn + drop. */
  | 'oversize'
  /** `events` missing / empty / not the documented record shape — warn + drop. */
  | 'bad-shape';

/** Outcome of evaluating one window 'message' event against the interaction contract. */
export type WhiteboardWidgetInteractionOutcome =
  | { Kind: 'interaction'; Event: WhiteboardWidgetInteractionEvent }
  | { Kind: 'dropped'; Reason: WhiteboardWidgetInteractionDropReason };

const INTERACTION_KINDS: ReadonlySet<string> = new Set(['click', 'change', 'input', 'focus', 'blur']);

/** Shape-check one entry of an interaction batch against {@link WhiteboardWidgetInteractionRecord}. */
function isInteractionRecord(value: unknown): value is WhiteboardWidgetInteractionRecord {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record['kind'] === 'string' && INTERACTION_KINDS.has(record['kind'])
    && typeof record['target'] === 'string'
    && (record['value'] === undefined || typeof record['value'] === 'string')
    && (record['tag'] === undefined || typeof record['tag'] === 'string');
}

/**
 * Host-side validation of one ambient-interaction 'message' event — mirrors the submit
 * path: marker required (`'not-interaction'` otherwise), `sourceWidget` must resolve to a
 * tracked widget iframe (`'unknown-source'`), the `events` array must be a non-empty list
 * of well-shaped {@link WhiteboardWidgetInteractionRecord}s (`'bad-shape'`), and the
 * serialized batch is capped at {@link WHITEBOARD_WIDGET_INTERACTION_MAX_CHARS}
 * (`'oversize'`). Accepted batches come back pre-summarized (via
 * {@link SummarizeWidgetInteractions}) as a {@link WhiteboardWidgetInteractionEvent}.
 */
export function EvaluateWidgetInteractionMessage(
  messageData: unknown,
  sourceWidget: { ItemID: string; Title?: string } | null
): WhiteboardWidgetInteractionOutcome {
  if (messageData === null || typeof messageData !== 'object'
    || (messageData as Record<string, unknown>)[WHITEBOARD_INTERACTION_MARKER] !== true) {
    return { Kind: 'dropped', Reason: 'not-interaction' };
  }
  if (!sourceWidget) {
    return { Kind: 'dropped', Reason: 'unknown-source' };
  }
  const events = (messageData as Record<string, unknown>)['events'];
  if (!Array.isArray(events) || events.length === 0 || !events.every(isInteractionRecord)) {
    return { Kind: 'dropped', Reason: 'bad-shape' };
  }
  if (JSON.stringify(events).length > WHITEBOARD_WIDGET_INTERACTION_MAX_CHARS) {
    return { Kind: 'dropped', Reason: 'oversize' };
  }
  return {
    Kind: 'interaction',
    Event: {
      ItemID: sourceWidget.ItemID,
      Title: sourceWidget.Title ?? '',
      Summary: SummarizeWidgetInteractions(events)
    }
  };
}

/** Defensive host-side re-clip (the recorder already truncates, but trust nothing). */
function clipValue(value: string): string {
  return value.length > WHITEBOARD_INTERACTION_VALUE_MAX_CHARS
    ? value.slice(0, WHITEBOARD_INTERACTION_VALUE_MAX_CHARS)
    : value;
}

/** Render one interaction record as a human fragment. */
function interactionPhrase(record: WhiteboardWidgetInteractionRecord): string {
  switch (record.kind) {
    case 'click':
      return record.target ? `clicked "${record.target}"` : `clicked ${record.tag ?? 'element'}`;
    case 'change':
      return record.value !== undefined
        ? `changed "${record.target}" to "${clipValue(record.value)}"`
        : `changed "${record.target}"`;
    case 'input':
      return `typing in "${record.target}"`;
    case 'focus':
      return `focused "${record.target}"`;
    case 'blur':
      return `left "${record.target}"`;
  }
}

/**
 * Compress one validated interaction batch into a compact human line, e.g.
 * `clicked "Playful pink"; changed "vibe" to "pink"; typing in "email"`.
 *
 * Pure: consecutive same-field `input` (typing) records are deduped (the LAST wins —
 * matching the recorder's latest-value semantics), values are defensively re-truncated to
 * {@link WHITEBOARD_INTERACTION_VALUE_MAX_CHARS}, and the whole line is capped at
 * {@link WHITEBOARD_INTERACTION_SUMMARY_MAX_CHARS} chars (ellipsized).
 */
export function SummarizeWidgetInteractions(events: WhiteboardWidgetInteractionRecord[]): string {
  const deduped: WhiteboardWidgetInteractionRecord[] = [];
  for (const event of events) {
    const previous = deduped[deduped.length - 1];
    if (previous && event.kind === 'input' && previous.kind === 'input' && previous.target === event.target) {
      deduped[deduped.length - 1] = event; // consecutive same-field typing — latest wins
    }
    else {
      deduped.push(event);
    }
  }
  const line = deduped.map(interactionPhrase).join('; ');
  if (line.length > WHITEBOARD_INTERACTION_SUMMARY_MAX_CHARS) {
    return line.slice(0, WHITEBOARD_INTERACTION_SUMMARY_MAX_CHARS - 1) + '…';
  }
  return line;
}
