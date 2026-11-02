/**
 * LIVE WHITEBOARD — the TWO-WAY widget protocol: the host sends commands INTO a sandboxed
 * HTML widget (inspect / operate / call / restore) and the injected helper answers.
 *
 * The one-way input bridge (`MJWhiteboard.submit` + the ambient recorder) lives in
 * `whiteboard-widget-bridge.ts`. This module adds the return path. It is Angular-free and
 * pure: message markers, the wire shapes, tolerant validators that never throw, and the
 * shared constants (caps, deadlines, error codes). {@link WhiteboardWidgetBroker} owns the
 * request/reply bookkeeping on top of it.
 *
 * Wire contract (every message is a plain object carrying exactly one marker):
 *
 * | Direction     | Marker                   | Payload                                   |
 * |---------------|--------------------------|-------------------------------------------|
 * | widget → host | `__mjWhiteboardReady`    | `{ doc, actions, hasState }`              |
 * | widget → host | `__mjWhiteboardActions`  | `{ actions }`                             |
 * | widget → host | `__mjWhiteboardState`    | `{ state, doc? }` (state: JSON string)    |
 * | widget → host | `__mjWhiteboardReply`    | `{ id, ok, result?, error?, code? }`      |
 * | host → widget | `__mjWhiteboardCommand`  | `{ id, op, args }`                        |
 *
 * Validation mirrors the existing bridge: the marker must be present, the sender must
 * resolve to a TRACKED widget iframe (the caller does that and passes the result in), and
 * payloads are size-capped. Replies are additionally matched to a pending command by the
 * broker (same window, pending id, current generation). Widget code shares its frame with
 * the helper, so everything that comes back is treated as untrusted DATA.
 *
 * The wire payloads keep the helper's camelCase field names (they are plain JS inside the
 * frame); the exported, validated outcomes use MJ's PascalCase.
 */

import type { WhiteboardToolJSONValue } from './whiteboard-tools';

// ───────────────────────────────────────────────────────────── markers

/** Marker on the helper's "loaded and listening" message (once per document, and in answer to `hello`). */
export const WHITEBOARD_WIDGET_READY_MARKER = '__mjWhiteboardReady';

/** Marker on the helper's "the widget's registered actions changed" message. */
export const WHITEBOARD_WIDGET_ACTIONS_MARKER = '__mjWhiteboardActions';

/** Marker on the helper's "the widget saved state" message. */
export const WHITEBOARD_WIDGET_STATE_MARKER = '__mjWhiteboardState';

/** Marker on the helper's reply to one host command. */
export const WHITEBOARD_WIDGET_REPLY_MARKER = '__mjWhiteboardReply';

/** Marker on a host → widget command. */
export const WHITEBOARD_WIDGET_COMMAND_MARKER = '__mjWhiteboardCommand';

// ───────────────────────────────────────────────────────────── caps

/** Max serialized size (chars) of one reply's `result`. Matches the submit cap. */
export const WHITEBOARD_WIDGET_REPLY_MAX_CHARS = 8000;

/** Max size (chars) of an inspect outline; longer outlines end with a truncation marker. */
export const WHITEBOARD_WIDGET_OUTLINE_MAX_CHARS = 3000;

/** Max size (chars) of one widget's saved state JSON. Oversize state is refused, never clipped. */
export const WHITEBOARD_WIDGET_STATE_MAX_CHARS = 4000;

/** Max number of actions one widget may register. */
export const WHITEBOARD_WIDGET_MAX_ACTIONS = 30;

/** Max number of steps in one operate command. */
export const WHITEBOARD_WIDGET_MAX_STEPS = 5;

/** Max length of one action description. */
export const WHITEBOARD_WIDGET_ACTION_DESCRIPTION_MAX_CHARS = 200;

/** A valid action name: a letter, then up to 39 letters / digits / `_` / `-`. */
export const WHITEBOARD_WIDGET_ACTION_NAME_PATTERN = /^[A-Za-z][\w-]{0,39}$/;

// ───────────────────────────────────────────────────────────── timing

/**
 * End-to-end deadline (ms) of one command, measured from when it is queued: queue wait,
 * mount, ready handshake and the operation itself all count. Every value stays under the
 * 15 s tool-result barrier of the Gemini Live and GPT-Live drivers, past which the model
 * moves on without the result.
 */
export const WHITEBOARD_WIDGET_DEADLINES_MS: Readonly<Record<WhiteboardWidgetCommandOp, number>> = {
  hello: 4000,
  inspect: 6000,
  operate: 9000,
  call: 12000,
  restoreState: 4000
};

/**
 * How long (ms) after an agent command ends the host still accepts an `agent` tag on that
 * widget's events. Covers the helper's own window (750 ms) plus slack for timer throttling
 * in hidden or background frames.
 */
export const WHITEBOARD_WIDGET_AGENT_WINDOW_MS = 1750;

// ───────────────────────────────────────────────────────────── shared types

/** The operations the host can ask a widget to perform. */
export type WhiteboardWidgetCommandOp = 'hello' | 'inspect' | 'operate' | 'call' | 'restoreState';

/** One step of an operate command. */
export type WhiteboardWidgetStepOp = 'click' | 'set' | 'select' | 'check' | 'uncheck' | 'focus';

/**
 * Machine-readable failure codes for widget commands and the widget agent tools. They
 * travel to the model as `errorCode` on the tool result, so each one names a situation the
 * model can act on.
 */
export type WhiteboardWidgetErrorCode =
  /** No item with that ID on the active page (the message names `Whiteboard_SwitchPage`). */
  | 'widget_not_found'
  /** The item exists but is not an HTML widget. */
  | 'not_html'
  /** No board is on screen to run the command (pure engine / surface not bound). */
  | 'surface_unavailable'
  /** A widget tool was sent through the synchronous entry point; use the async one. */
  | 'async_required'
  /** The widget never reported ready within the deadline. */
  | 'widget_not_ready'
  /** The widget was ready but still handling an earlier command until the deadline; retry. */
  | 'widget_busy'
  /** The widget accepted the command but did not answer within the deadline. */
  | 'widget_timeout'
  /** The widget's document reloaded while the command was in flight. */
  | 'widget_reloaded'
  /** The widget was unmounted while the command was in flight. */
  | 'widget_unmounted'
  /** A ref from an earlier inspect no longer points at an element. */
  | 'stale_ref'
  /** A label matched several elements; the error lists the candidate refs. */
  | 'ambiguous_target'
  /** Nothing matched the target. */
  | 'target_not_found'
  /** The target element is disabled. */
  | 'disabled'
  /** The widget or the element opted out of agent operation, or the field is protected. */
  | 'not_operable'
  /** The widget has no action by that name; the error lists the registered names. */
  | 'unknown_action'
  /** The widget's action handler threw; the error carries its message. */
  | 'action_failed'
  /** The host's widget-access policy does not allow this command. */
  | 'access_denied'
  /** The host vetoed this specific command; the error carries its reason. */
  | 'vetoed'
  /** The tool arguments are missing or malformed. */
  | 'invalid_args';

const ERROR_CODES: ReadonlySet<string> = new Set<WhiteboardWidgetErrorCode>([
  'widget_not_found', 'not_html', 'surface_unavailable', 'async_required', 'widget_not_ready',
  'widget_busy', 'widget_timeout', 'widget_reloaded', 'widget_unmounted', 'stale_ref', 'ambiguous_target',
  'target_not_found', 'disabled', 'not_operable', 'unknown_action', 'action_failed',
  'access_denied', 'vetoed', 'invalid_args'
]);

/** True when `value` is one of the documented {@link WhiteboardWidgetErrorCode}s. */
export function IsWhiteboardWidgetErrorCode(value: string): value is WhiteboardWidgetErrorCode {
  return ERROR_CODES.has(value);
}

/** One named action a widget registered with `MJWhiteboard.onAction`. */
export interface WhiteboardWidgetActionInfo {
  /** The action name the agent calls it by. */
  Name: string;
  /** Optional author-supplied description. */
  Description?: string;
}

/**
 * The minimal surface of a frame window the protocol posts commands to. A real
 * `contentWindow` satisfies it; tests pass a stub.
 */
export interface WhiteboardWidgetTarget {
  postMessage(message: WhiteboardWidgetCommandMessage, targetOrigin: string): void;
}

/** The wire shape of one host → widget command. */
export interface WhiteboardWidgetCommandMessage {
  [WHITEBOARD_WIDGET_COMMAND_MARKER]: true;
  /** Correlation id, echoed by the reply. */
  id: string;
  /** What to do. */
  op: WhiteboardWidgetCommandOp;
  /** Operation arguments (op-specific JSON). */
  args: WhiteboardToolJSONValue;
}

/** Build the wire message for one command. */
export function BuildWidgetCommandMessage(
  id: string,
  op: WhiteboardWidgetCommandOp,
  args: WhiteboardToolJSONValue
): WhiteboardWidgetCommandMessage {
  return { [WHITEBOARD_WIDGET_COMMAND_MARKER]: true, id, op, args };
}

// ───────────────────────────────────────────────────────────── evaluated messages

/** A validated message from a widget's helper (everything except submit / interaction). */
export type WhiteboardWidgetChannelMessage =
  | {
      Kind: 'ready';
      ItemID: string;
      /**
       * Random token minted once per widget DOCUMENT. A repeated ready with the same token
       * (e.g. the answer to `hello`) is the same document; a new token means it reloaded.
       */
      DocumentToken: string;
      Actions: WhiteboardWidgetActionInfo[];
      HasState: boolean;
    }
  | { Kind: 'actions'; ItemID: string; Actions: WhiteboardWidgetActionInfo[] }
  | {
      Kind: 'state';
      ItemID: string;
      StateJson: string;
      /** The sending document's token (as on its ready), when the helper supplies one. */
      DocumentToken?: string;
    }
  | { Kind: 'reply'; ItemID: string; Reply: WhiteboardWidgetReply };

/** A validated reply to one command. */
export interface WhiteboardWidgetReply {
  /** The correlation id of the command this answers. */
  ID: string;
  /** Whether the command succeeded. */
  Ok: boolean;
  /** The op-specific result (present when `Ok`). */
  Result?: WhiteboardToolJSONValue;
  /** Failure description (present when not `Ok`). */
  Error?: string;
  /** Machine-readable failure code, when the helper supplied a known one. */
  Code?: WhiteboardWidgetErrorCode;
}

/** Why a window message was not accepted as a widget-protocol message. */
export type WhiteboardWidgetChannelDropReason =
  /** Carries none of this module's markers — other traffic, ignore silently. */
  | 'not-widget-channel'
  /** A marker is present but the sender is not a tracked widget iframe. */
  | 'unknown-source'
  /** The payload does not match the documented shape. */
  | 'bad-shape'
  /** The payload exceeds its size cap. */
  | 'oversize';

/** Outcome of {@link EvaluateWidgetChannelMessage}. */
export type WhiteboardWidgetChannelOutcome =
  | { Kind: 'accepted'; Message: WhiteboardWidgetChannelMessage }
  | { Kind: 'dropped'; Reason: WhiteboardWidgetChannelDropReason };

type WireRecord = Record<string, WhiteboardToolJSONValue | undefined>;

function asRecord(value: unknown): WireRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as WireRecord) : null;
}

/**
 * Host-side validation of one window 'message' event against the widget protocol:
 *
 *  1. the payload must carry one of the ready / actions / state / reply markers
 *     (anything else is `'not-widget-channel'` and is ignored silently);
 *  2. `sourceWidget` is the caller's resolution of `event.source` against its tracked
 *     widget iframes; `null` drops the message as `'unknown-source'`;
 *  3. the payload is shape-checked and size-capped.
 *
 * Never throws. Replies are NOT matched to a pending command here; the broker does that.
 */
export function EvaluateWidgetChannelMessage(
  messageData: unknown,
  sourceWidget: { ItemID: string } | null
): WhiteboardWidgetChannelOutcome {
  const data = asRecord(messageData);
  const kind = data ? markerKind(data) : null;
  if (!data || !kind) {
    return { Kind: 'dropped', Reason: 'not-widget-channel' };
  }
  if (!sourceWidget) {
    return { Kind: 'dropped', Reason: 'unknown-source' };
  }
  switch (kind) {
    case 'ready':
      return evaluateReady(data, sourceWidget.ItemID);
    case 'actions':
      return evaluateActions(data, sourceWidget.ItemID);
    case 'state':
      return evaluateState(data, sourceWidget.ItemID);
    case 'reply':
      return evaluateReply(data, sourceWidget.ItemID);
  }
}

function markerKind(data: WireRecord): WhiteboardWidgetChannelMessage['Kind'] | null {
  if (data[WHITEBOARD_WIDGET_READY_MARKER] === true) {
    return 'ready';
  }
  if (data[WHITEBOARD_WIDGET_ACTIONS_MARKER] === true) {
    return 'actions';
  }
  if (data[WHITEBOARD_WIDGET_STATE_MARKER] === true) {
    return 'state';
  }
  if (data[WHITEBOARD_WIDGET_REPLY_MARKER] === true) {
    return 'reply';
  }
  return null;
}

/** A per-document token: a non-empty string of at most 64 chars. */
function isDocumentToken(value: WhiteboardToolJSONValue | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64;
}

function evaluateReady(data: WireRecord, itemId: string): WhiteboardWidgetChannelOutcome {
  const actions = parseActions(data['actions']);
  const doc = data['doc'];
  if (!actions || !isDocumentToken(doc)) {
    return { Kind: 'dropped', Reason: 'bad-shape' };
  }
  return {
    Kind: 'accepted',
    Message: { Kind: 'ready', ItemID: itemId, DocumentToken: doc, Actions: actions, HasState: data['hasState'] === true }
  };
}

function evaluateActions(data: WireRecord, itemId: string): WhiteboardWidgetChannelOutcome {
  const actions = parseActions(data['actions']);
  if (!actions) {
    return { Kind: 'dropped', Reason: 'bad-shape' };
  }
  return { Kind: 'accepted', Message: { Kind: 'actions', ItemID: itemId, Actions: actions } };
}

function evaluateState(data: WireRecord, itemId: string): WhiteboardWidgetChannelOutcome {
  const state = data['state'];
  if (typeof state !== 'string') {
    return { Kind: 'dropped', Reason: 'bad-shape' };
  }
  if (state.length > WHITEBOARD_WIDGET_STATE_MAX_CHARS) {
    return { Kind: 'dropped', Reason: 'oversize' };
  }
  const doc = data['doc'];
  if (!isJsonText(state)) {
    return { Kind: 'dropped', Reason: 'bad-shape' };
  }
  if (doc === undefined) {
    return { Kind: 'accepted', Message: { Kind: 'state', ItemID: itemId, StateJson: state } };
  }
  if (!isDocumentToken(doc)) {
    return { Kind: 'dropped', Reason: 'bad-shape' };
  }
  return { Kind: 'accepted', Message: { Kind: 'state', ItemID: itemId, StateJson: state, DocumentToken: doc } };
}

function evaluateReply(data: WireRecord, itemId: string): WhiteboardWidgetChannelOutcome {
  const id = data['id'];
  const ok = data['ok'];
  if (typeof id !== 'string' || id.length === 0 || typeof ok !== 'boolean') {
    return { Kind: 'dropped', Reason: 'bad-shape' };
  }
  const result = data['result'];
  if (result !== undefined && !fitsCap(result, WHITEBOARD_WIDGET_REPLY_MAX_CHARS)) {
    return { Kind: 'dropped', Reason: 'oversize' };
  }
  const reply: WhiteboardWidgetReply = { ID: id, Ok: ok };
  if (result !== undefined) {
    reply.Result = result;
  }
  const error = data['error'];
  if (typeof error === 'string') {
    reply.Error = error.slice(0, 500);
  }
  const code = data['code'];
  if (typeof code === 'string' && IsWhiteboardWidgetErrorCode(code)) {
    reply.Code = code;
  }
  return { Kind: 'accepted', Message: { Kind: 'reply', ItemID: itemId, Reply: reply } };
}

/**
 * Parse a wire action list. Returns `null` for a non-array; drops malformed entries,
 * de-duplicates by name, and keeps at most {@link WHITEBOARD_WIDGET_MAX_ACTIONS}.
 */
function parseActions(value: WhiteboardToolJSONValue | undefined): WhiteboardWidgetActionInfo[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const out: WhiteboardWidgetActionInfo[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const info = parseAction(entry);
    if (info && !seen.has(info.Name) && out.length < WHITEBOARD_WIDGET_MAX_ACTIONS) {
      seen.add(info.Name);
      out.push(info);
    }
  }
  return out;
}

function parseAction(entry: WhiteboardToolJSONValue): WhiteboardWidgetActionInfo | null {
  const record = asRecord(entry);
  const name = record?.['name'];
  if (typeof name !== 'string' || !WHITEBOARD_WIDGET_ACTION_NAME_PATTERN.test(name)) {
    return null;
  }
  const description = record?.['description'];
  return typeof description === 'string' && description.trim().length > 0
    ? { Name: name, Description: description.trim().slice(0, WHITEBOARD_WIDGET_ACTION_DESCRIPTION_MAX_CHARS) }
    : { Name: name };
}

function fitsCap(value: WhiteboardToolJSONValue, max: number): boolean {
  try {
    const json = JSON.stringify(value);
    return json !== undefined && json.length <= max;
  }
  catch {
    return false;
  }
}

function isJsonText(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  }
  catch {
    return false;
  }
}

// ───────────────────────────────────────────────────────────── command args and results
//
// The shapes the helper receives as `args` and returns as `result`, per op. They cross
// the frame boundary as plain JSON in camelCase (the helper is hand-written ES5); the
// broker hands `result` back untyped, and `whiteboard-tools.ts` validates it into these
// PascalCase interfaces before anything reaches the model.

/** One step of an operate command. */
export interface WhiteboardWidgetStep {
  /** A ref from the latest inspect (`f3`, `a1`), a visible label, or a CSS selector. */
  Target: string;
  /** What to do to the target. */
  Op: WhiteboardWidgetStepOp;
  /** Value for `set` (text / number / date) and `select` (option value or label). */
  Value?: string;
}

/** The last submit a widget made (automatic state; lets the agent tell a record from a live exercise). */
export interface WhiteboardWidgetAnswered {
  /** Epoch ms of the submit. */
  At: number;
  /** The submitted payload, JSON-serialized. */
  DataJson: string;
}

/** Result of `inspect`. */
export interface WhiteboardWidgetInspectResult {
  /** The outline text the model reads (≤ {@link WHITEBOARD_WIDGET_OUTLINE_MAX_CHARS}). */
  Outline: string;
  /** Actions the widget registered. */
  Actions: WhiteboardWidgetActionInfo[];
  /** The widget's declared state (clipped), when it uses the state API. */
  State?: string;
  /** The widget's last submit, when automatic state captured one. */
  Answered?: WhiteboardWidgetAnswered;
}

/** Per-step outcome inside an operate result. */
export interface WhiteboardWidgetStepOutcome {
  Ok: boolean;
  Code?: WhiteboardWidgetErrorCode;
  Error?: string;
}

/** Result of `operate`. */
export interface WhiteboardWidgetOperateResult {
  /** One entry per attempted step (stops after the first failure). */
  Steps: WhiteboardWidgetStepOutcome[];
  /** The outline after the widget settled. */
  Outline: string;
  /** JSON of a submit the operation triggered, if any. */
  SubmittedJson?: string;
}

/** Result of `call`. */
export interface WhiteboardWidgetCallResult {
  /** The handler's return value, JSON-serialized (`null` when it returned nothing). */
  ResultJson: string | null;
}

/*
 * Wire args (host → helper), camelCase:
 *   inspect       {}
 *   operate       { steps: [{ target, op, value? }], ringColor }
 *   call          { action, payload }
 *   restoreState  { state: string | null }   // state = the helper's opaque envelope JSON { declared, fields, answered }
 *   hello         null
 * Wire results (helper → host), camelCase:
 *   inspect  { outline, actions: [{ name, description? }], state?, answered?: { at, data } }
 *   operate  { steps: [{ ok, code?, error? }], outline, submitted? }
 *   call     { result }
 */
