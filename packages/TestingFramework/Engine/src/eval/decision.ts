/**
 * decision.ts — normalizing what an agent DECIDED, independently of how it said so.
 *
 * This is the load-bearing idea of the whole eval harness (test plan §1). A corpus case states the
 * decision it expects — "invoke `Run Ad-hoc Query` with these params" — and never how the wire
 * encodes it. Two encodings exist today and a third is coming:
 *
 *   envelope  — a `LoopAgentResponse` JSON object with `nextStep.actions[]`
 *   native    — provider tool calls on the assistant turn
 *
 * Both collapse here into one {@link ObservedDecision} before anything is scored. That is what
 * makes a baseline run and a native run *directly comparable on identical cases*:
 * the only thing that changed between them is the model's behavior, not the yardstick.
 *
 * FRAMEWORK-FREE (test plan §2.1). Nothing in `src/eval/` imports from the testing engine — not
 * `IOracle`, not `TestEngine`, not the driver types. The oracles in `src/oracles/` are thin
 * wrappers over these functions, and a bespoke runner could call them directly. That rule exists so
 * the documented fallback (§2.1, option B) stays cheap; it also happens to make every line here
 * unit-testable without a database.
 */

/**
 * What kind of decision the agent made, in the vocabulary the corpus uses.
 *
 * These are deliberately the *decision* kinds, not the `nextStep.type` values — `taskComplete` is a
 * decision but not a step type, and `Retry`/`ForEach`/`While` are control flow the corpus does not
 * assert on. Anything the normalizer cannot place lands in `other`, which is a legitimate
 * observation rather than an error.
 */
export type DecisionKind =
    | 'action'
    | 'subAgent'
    | 'chat'
    | 'taskComplete'
    | 'payloadChange'
    | 'other'
    /** Output existed but could not be read as a decision — the malformed class. */
    | 'unparseable'
    /** No usable output at all (empty content, no tool calls). */
    | 'empty';

/** How the decision arrived on the wire. Recorded so a comparison can attribute a delta to it. */
export type DecisionEncoding = 'envelope' | 'native' | 'text' | 'none';

/** What calling a control-flow tool decides. Sub-agent entries carry the agent's name. */
export type ControlToolRole = { kind: 'subAgent'; name: string } | { kind: 'payloadChange' } | { kind: 'chat' };

/** One action invocation, normalized across both encodings. */
export interface ObservedAction {
    name: string;
    params: Record<string, unknown>;
}

/** One sub-agent dispatch. */
export interface ObservedSubAgent {
    name: string;
    message?: string;
}

/** The normalized decision: everything a corpus case is allowed to assert against. */
export interface ObservedDecision {
    kind: DecisionKind;
    encoding: DecisionEncoding;
    actions: ObservedAction[];
    subAgents: ObservedSubAgent[];
    /** The user-facing message, when the agent produced one. */
    message?: string;
    /** True when the envelope declared the task finished. */
    taskComplete: boolean;
    /** Present when the turn carried a payload change request. */
    payloadChange?: Record<string, unknown>;
    /** Whether an envelope was expected and successfully parsed. `null` when none was expected. */
    envelopeParsed: boolean | null;
    /**
     * The raw `nextStep.type` exactly as the model wrote it, before any normalization.
     *
     * Kept because the DECISION and the VALIDITY are different questions. `classifyEnvelope` is
     * lenient by design — it infers a kind from the payload when the type is missing or odd, which
     * is what makes the decision comparable across encodings. But the runtime is not lenient: it
     * switches case-sensitively on this string and sends anything unrecognized to a forced Retry.
     * A response can therefore be a perfectly good decision and still be malformed, and
     * {@link evaluateWellFormed} needs the raw value to say so.
     */
    stepType?: string | null;
    /** Why the decision is `unparseable` / `empty`, for the oracle's message. */
    diagnostic?: string;
    /**
     * Native turns only: the model ALSO returned a parseable Loop envelope alongside its tool calls
     * The tool call still wins — this records that something was discarded.
     */
    dualChannel?: boolean;
    /** What that discarded envelope would have decided, when `dualChannel` is true. */
    shadowEnvelopeKind?: DecisionKind;
    /** Native turns only: prose accompanied the call(s) and was not an envelope (Haiku: 30% of call turns in run 7). */
    narrationWithCalls?: boolean;
    /** Native turns only: the calls carried empty or placeholder arguments alongside prose — the Sonnet 5 pattern of results §13.3. */
    placeholderCall?: boolean;
}

/** What the harness observed on the wire, before normalization. */
export interface RawTurn {
    /** The model's text output, if any. */
    text?: string | null;
    /** Native tool calls on the assistant turn, if the driver requested tools. */
    toolCalls?: Array<{ name: string; arguments?: Record<string, unknown> }> | null;
    /**
     * Sanitized tool name → the Action name the framework dispatches for it.
     *
     * Provider tool names are constrained (`^[a-zA-Z0-9_-]+$` and friends), so MJ's Action names
     * are sanitized on the way out: `Execute Code` is declared as `execute_code`. A corpus case
     * names the ACTION, per §1.2 — comparing the raw wire name against it would score every
     * correct native call as the wrong action, measuring the sanitizer rather than the model.
     *
     * The driver supplies the framework's own reverse map, the same one `LoopAgentType` dispatches
     * from. An unmapped name passes through unchanged: a model that invented a tool should be
     * reported under the name it invented, not silently dropped.
     */
    toolNameMap?: Readonly<Record<string, string>> | null;
    /**
     * Which protocol the turn was produced under. `'implicit'` reads plain text with no call as
     * task completion; the other two keep the envelope rules. Absent = `'envelope'`.
     */
    protocol?: 'envelope' | 'hybrid' | 'implicit' | null;
    /** Control-flow tool name → what calling it decides. Absent when no control tools were declared. */
    controlToolMap?: Readonly<Record<string, ControlToolRole>> | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * Strips a markdown fence so a fenced-but-otherwise-correct envelope still counts as parsed.
 *
 * Fencing is a formatting habit, not a decision error. Counting it as malformed would inflate the
 * exact metric this harness exists to measure honestly — and MJ's own loop parser tolerates it, so
 * scoring it as a failure would also diverge from what production actually does.
 */
export function StripJsonFence(text: string): string {
    const trimmed = text.trim();
    if (!trimmed.startsWith('```')) {
        return trimmed;
    }
    return trimmed.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
}

/** @deprecated Use {@link StripJsonFence}. */
export function stripJsonFence(text: string): string {
    return StripJsonFence(text);
}

function readActions(nextStep: Record<string, unknown> | null): ObservedAction[] {
    const raw = nextStep?.actions;
    if (!Array.isArray(raw)) {
        return [];
    }
    const actions: ObservedAction[] = [];
    for (const entry of raw) {
        const record = asRecord(entry);
        const name = record?.name;
        if (typeof name === 'string' && name.length > 0) {
            actions.push({ name, params: asRecord(record?.params) ?? {} });
        }
    }
    return actions;
}

function readSubAgents(nextStep: Record<string, unknown> | null): ObservedSubAgent[] {
    const found: ObservedSubAgent[] = [];
    const single = asRecord(nextStep?.subAgent);
    const many = Array.isArray(nextStep?.subAgents) ? nextStep?.subAgents : [];
    for (const entry of [single, ...many.map(asRecord)]) {
        const name = entry?.name;
        if (typeof name === 'string' && name.length > 0) {
            found.push({ name, message: typeof entry?.message === 'string' ? entry.message : undefined });
        }
    }
    return found;
}

/**
 * Picks the decision kind from an envelope's contents.
 *
 * Order matters and mirrors what `LoopAgentType.DetermineNextStep` actually does, not what the
 * interface suggests: a Chat step is honored even when `taskComplete` is true, and an explicit
 * `nextStep` outranks the completion flag. Scoring against a different precedence than production
 * uses would measure the harness, not the agent.
 */
function classifyEnvelope(
    stepType: string | null,
    actions: ObservedAction[],
    subAgents: ObservedSubAgent[],
    taskComplete: boolean,
    hasPayloadChange: boolean,
    hasResponseForm: boolean
): DecisionKind {
    const lowered = stepType?.toLowerCase().trim();
    if (lowered === 'chat') {
        return 'chat';
    }
    if (lowered === 'actions' || (!lowered && actions.length > 0)) {
        return 'action';
    }
    if (lowered === 'sub-agent' || (!lowered && subAgents.length > 0)) {
        return 'subAgent';
    }
    if (taskComplete) {
        return 'taskComplete';
    }
    // `responseForm` is a first-class field on LoopAgentResponse — it is HOW an MJ agent asks the
    // user a structured question. A turn carrying one is addressing the user, which is a chat
    // decision by every measure the corpus cares about; only the encoding differs from a plain
    // `nextStep: { type: 'Chat' }`. Ranked below an explicit nextStep so a turn that says both
    // still dispatches the way production dispatches it.
    if (hasResponseForm) {
        return 'chat';
    }
    // A turn whose only content is a payload write is a payloadChange decision; the loop's own
    // validator treats that case as an implicit completion rather than an error.
    if (hasPayloadChange) {
        return 'payloadChange';
    }
    return 'other';
}

/**
 * Counts complete top-level JSON objects in a string that failed to parse as one — the
 * "two envelopes back to back" shape. String-aware brace counting; returns 0 unless at least two
 * objects were found, so a single malformed object is left to the ordinary diagnostic.
 */
export function CountConcatenatedObjects(text: string): number {
    let depth = 0, inString = false, escaped = false, objects = 0;
    for (const ch of text) {
        if (inString) {
            if (escaped) { escaped = false; }
            else if (ch === '\\') { escaped = true; }
            else if (ch === '"') { inString = false; }
            continue;
        }
        if (ch === '"') { inString = true; }
        else if (ch === '{') { depth++; }
        else if (ch === '}') { depth--; if (depth === 0) { objects++; } }
    }
    return objects >= 2 ? objects : 0;
}

/** @deprecated Use {@link CountConcatenatedObjects}. */
export function countConcatenatedObjects(text: string): number {
    return CountConcatenatedObjects(text);
}

/** Reads an envelope out of raw text. Never throws — unparseable output is an observation. */
function normalizeEnvelope(text: string): ObservedDecision {
    const base = { encoding: 'envelope' as const, actions: [], subAgents: [], taskComplete: false, envelopeParsed: false };
    if (text.trim().length === 0) {
        return { ...base, kind: 'empty', encoding: 'none', envelopeParsed: null, diagnostic: 'no output' };
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(StripJsonFence(text));
    } catch (error) {
        const concatenated = CountConcatenatedObjects(StripJsonFence(text));
        return {
            ...base,
            kind: 'unparseable',
            diagnostic: concatenated > 0
                ? `envelope did not parse: ${concatenated} complete JSON objects were concatenated in one turn`
                : `envelope did not parse: ${(error as Error).message}`
        };
    }
    const record = asRecord(parsed);
    if (!record) {
        return { ...base, kind: 'unparseable', diagnostic: 'envelope parsed but was not a JSON object' };
    }

    const nextStep = asRecord(record.nextStep);
    const actions = readActions(nextStep);
    const subAgents = readSubAgents(nextStep);
    const payloadChange = asRecord(record.payloadChangeRequest) ?? undefined;
    const taskComplete = record.taskComplete === true;
    const stepType = typeof nextStep?.type === 'string' ? nextStep.type : null;

    return {
        kind: classifyEnvelope(stepType, actions, subAgents, taskComplete, payloadChange !== undefined,
            asRecord(record.responseForm) !== null),
        encoding: 'envelope',
        stepType,
        actions,
        subAgents,
        message: typeof record.message === 'string' ? record.message : undefined,
        taskComplete,
        payloadChange,
        envelopeParsed: true
    };
}

const PLACEHOLDER_VALUES = /^(placeholder|none|n\/a|null|nothing|-)$/i;
const PLACEHOLDER_PHRASES = /none needed|just checking/i;

/**
 * Spec §8.2: prose accompanied the call(s) and every call has empty arguments, or every string
 * argument is a placeholder token. The Sonnet 5 pattern of results §13.3, made countable.
 */
export function IsPlaceholderCall(calls: NonNullable<RawTurn['toolCalls']>, text: string | null | undefined): boolean {
    if (!text?.trim() || calls.length === 0) return false;
    return calls.every((c) => {
        const values = Object.values(c.arguments ?? {});
        if (values.length === 0) return true;
        const strings = values.filter((v): v is string => typeof v === 'string');
        return strings.length === values.length && strings.every((v) => PLACEHOLDER_VALUES.test(v.trim()) || PLACEHOLDER_PHRASES.test(v));
    });
}

/** @deprecated Use {@link IsPlaceholderCall}. */
export function isPlaceholderCall(calls: NonNullable<RawTurn['toolCalls']>, text: string | null | undefined): boolean {
    return IsPlaceholderCall(calls, text);
}

/** Native-turn classification: control tools first (spec §8.1), then Actions, then payload-only. */
function normalizeNativeTurn(turn: RawTurn, calls: NonNullable<RawTurn['toolCalls']>, text: string | undefined): ObservedDecision {
    const toActionName = (toolName: string): string => turn.toolNameMap?.[toolName] ?? toolName;
    const role = (toolName: string): ControlToolRole | undefined => turn.controlToolMap?.[toolName];
    // The call wins, but if the text is ALSO a valid envelope the model gave
    // two answers. Record it; the scorecard counts it; production does the same on NativeDualChannel.
    const shadow = text ? normalizeEnvelope(text) : null;
    const dualChannel = shadow?.envelopeParsed === true;
    const base = {
        encoding: 'native' as const,
        envelopeParsed: null,
        message: text,
        taskComplete: false,
        dualChannel,
        ...(dualChannel ? { shadowEnvelopeKind: shadow!.kind } : {}),
        narrationWithCalls: !!text && !dualChannel,
        placeholderCall: IsPlaceholderCall(calls, text)
    };
    const ask = calls.find((c) => role(c.name)?.kind === 'chat');
    if (ask) {
        const message = typeof ask.arguments?.message === 'string' ? ask.arguments.message : undefined;
        return { ...base, kind: 'chat', actions: [], subAgents: [], message: message ?? text };
    }
    const payloadCall = calls.find((c) => role(c.name)?.kind === 'payloadChange');
    const payloadChange = payloadCall ? (payloadCall.arguments ?? {}) : undefined;
    const subAgents = calls.flatMap((c) => { const r = role(c.name); return r?.kind === 'subAgent' ? [{ name: r.name }] : []; });
    const actions = calls.filter((c) => !role(c.name)).map((c) => ({ name: toActionName(c.name), params: c.arguments ?? {} }));
    if (subAgents.length > 0) {
        return { ...base, kind: 'subAgent', actions, subAgents, payloadChange };
    }
    if (actions.length > 0) {
        return { ...base, kind: 'action', actions, subAgents: [], payloadChange };
    }
    return { ...base, kind: 'payloadChange', actions: [], subAgents: [], payloadChange };
}

/**
 * Normalizes one turn into an {@link ObservedDecision}.
 *
 * Native tool calls win when present: a model that emitted both has made its decision natively and
 * the text is at most a narration of it. This is the rule the corpus specifies, and the provider matrix
 * measured why it matters — Gemini 3.7 Flash under JSON mode answers a tool question natively while
 * ignoring the requested envelope entirely, which an envelope-only reader scores as 100% malformed
 * even though the decision was correct.
 *
 * Under the implicit protocol, plain text with no call is the terminal form: it reads as
 * task completion unless it parses as an envelope, in which case the envelope is honoured (§2.1).
 */
export function NormalizeDecision(turn: RawTurn): ObservedDecision {
    const calls = turn.toolCalls ?? [];
    const text = turn.text?.trim() ? turn.text : undefined;
    if (calls.length > 0) {
        return normalizeNativeTurn(turn, calls, text);
    }
    if (turn.protocol === 'implicit' && text) {
        const asEnvelope = normalizeEnvelope(text);
        if (asEnvelope.envelopeParsed) return asEnvelope;
        return { kind: 'taskComplete', encoding: 'text', actions: [], subAgents: [], message: text.trim(), taskComplete: true, envelopeParsed: null };
    }
    return normalizeEnvelope(turn.text ?? '');
}

/** @deprecated Use {@link NormalizeDecision}. */
export function normalizeDecision(turn: RawTurn): ObservedDecision {
    return NormalizeDecision(turn);
}
