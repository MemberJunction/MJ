/**
 * observe.ts — turns one `ChatResult` into one row of matrix data.
 *
 * Pure functions over `@memberjunction/ai` types: no I/O, no framework, no clock. That is what
 * makes the measuring instrument itself unit-testable (test plan §5, unit tier) — the live run
 * then carries only measurement noise, not harness bugs.
 *
 * The central idea is the test plan's mode-agnostic normalizer (§3.2): a decision is read off
 * whichever channel the model used — native `toolCalls` if present, otherwise the parsed envelope's
 * `nextStep.actions` — and compared against one encoding-independent expectation. An envelope cell
 * and a native cell on the same scenario therefore produce directly comparable numbers.
 */
import type { ChatResult, ChatToolCall } from '@memberjunction/ai';
import type { ArgumentMatcher, ExpectedToolCall, ProbeExpectation, ProbeScenario, ProbeToolMode } from './types';

/** Which channel the model answered through, once both encodings are normalized. */
export type ObservedChannel = 'tool-call' | 'envelope' | 'text' | 'empty' | 'error';

/** A call, normalized across the two encodings so the same assertions run on both. */
export interface ObservedCall {
    name: string;
    arguments: Record<string, unknown>;
    /** How it arrived — a native tool call, or an action inside the JSON envelope. */
    channel: 'tool-call' | 'envelope';
}

/** Everything one request/response pair contributes to the scorecard. */
export interface CellObservation {
    driverSucceeded: boolean;
    errorMessage: string | null;
    finishReason: string | null;
    /** Whether the driver downgraded a streaming request because tools were declared (§5.5). */
    streamingSuppressedForTools: boolean;

    textPresent: boolean;
    textLength: number;

    nativeToolCallCount: number;
    /** True when the turn carried BOTH text and native calls — legal everywhere, frequency varies. */
    textAndCallsTogether: boolean;
    /** Every native call has a non-empty name, a declared name, and a plain object for arguments. */
    nativeCallsWellFormed: boolean;
    /** Names the model invented that were never declared. Empty is the expected case. */
    undeclaredToolNames: string[];

    envelopeParsed: boolean | null;
    envelopeValid: boolean | null;

    channel: ObservedChannel;
    observedCallNames: string[];
    /**
     * The arguments the model actually sent, per call, truncated for storage.
     *
     * A failed argument matcher says fidelity was lost; only the payload says HOW. Diagnosing the
     * §8.2 permissive mapping needed exactly this — a matcher that expects a SQL string cannot
     * distinguish "the model sent nothing" from "the model sent an object, because the schema said
     * the param was an object".
     */
    observedArguments: Array<Record<string, unknown>>;
    /** The decision matched the expectation — right calls, or correctly no call at all. */
    decisionCorrect: boolean;
    /** Share of argument matchers that passed, or `null` when none applied. */
    argumentMatchRate: number | null;

    /**
     * Whether the provider honored the forcing semantics of the cell's mode, or `null` for the
     * modes that impose none (`no-tools`, `auto`). This is the §9.3 "forcing semantics" datum.
     */
    toolChoiceHonored: boolean | null;

    promptTokens: number | null;
    completionTokens: number | null;
}

/** Reads one argument through one matcher. Missing arguments always fail. */
export function matchArgument(matcher: ArgumentMatcher, args: Record<string, unknown>): boolean {
    const value = args[matcher.parameter];
    switch (matcher.kind) {
        case 'nonEmptyString':
            return typeof value === 'string' && value.trim().length > 0;
        case 'containsIgnoreCase':
            return typeof value === 'string' && value.toLowerCase().includes(matcher.value.toLowerCase());
        case 'oneOf':
            return typeof value === 'string' && matcher.values.includes(value);
        default:
            return false;
    }
}

/**
 * Strips the markdown fence models add even when told not to, so a fenced-but-otherwise-correct
 * envelope counts as parsed. Fencing is a formatting habit, not a decision error, and conflating
 * the two would inflate the malformed rate this matrix is meant to measure honestly.
 */
export function stripJsonFence(text: string): string {
    const trimmed = text.trim();
    if (!trimmed.startsWith('```')) {
        return trimmed;
    }
    const withoutOpen = trimmed.replace(/^```[a-zA-Z]*\s*\n?/, '');
    return withoutOpen.replace(/\n?```\s*$/, '').trim();
}

/** The subset of `LoopAgentResponse` the envelope probe asks for and this module reads back. */
interface ParsedEnvelope {
    taskComplete?: unknown;
    nextStep?: { type?: unknown; actions?: unknown };
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Parses the envelope and says whether it satisfies the contract the loop branches on. */
export function readEnvelope(text: string): { parsed: boolean; valid: boolean; envelope: ParsedEnvelope | null } {
    if (!text || text.trim().length === 0) {
        return { parsed: false, valid: false, envelope: null };
    }
    let candidate: unknown;
    try {
        candidate = JSON.parse(stripJsonFence(text));
    } catch {
        return { parsed: false, valid: false, envelope: null };
    }
    const record = asRecord(candidate);
    if (!record) {
        return { parsed: false, valid: false, envelope: null };
    }
    const envelope: ParsedEnvelope = { taskComplete: record.taskComplete, nextStep: asRecord(record.nextStep) ?? undefined };
    // The loop's own validator requires taskComplete, and a continuing turn to name its next step.
    const hasCompletion = typeof envelope.taskComplete === 'boolean';
    const nextStepTyped = typeof envelope.nextStep?.type === 'string';
    const valid = hasCompletion && (envelope.taskComplete === true || nextStepTyped);
    return { parsed: true, valid, envelope };
}

/** Lifts `nextStep.actions` into the same shape as a native call so one comparison serves both. */
function envelopeActionsAsCalls(envelope: ParsedEnvelope | null): ObservedCall[] {
    const actions = envelope?.nextStep?.actions;
    if (!Array.isArray(actions)) {
        return [];
    }
    const calls: ObservedCall[] = [];
    for (const entry of actions) {
        const record = asRecord(entry);
        const name = record?.name;
        if (typeof name === 'string' && name.length > 0) {
            calls.push({ name, arguments: asRecord(record?.params) ?? {}, channel: 'envelope' });
        }
    }
    return calls;
}

function nativeCallsAsObserved(toolCalls: ChatToolCall[]): ObservedCall[] {
    return toolCalls.map((call) => ({ name: call.name, arguments: call.arguments ?? {}, channel: 'tool-call' as const }));
}

/** A native call is well-formed when it can actually be dispatched: named, declared, object args. */
function nativeCallWellFormed(call: ChatToolCall, declaredNames: Set<string>): boolean {
    const named = typeof call.name === 'string' && call.name.length > 0;
    const argsAreObject = asRecord(call.arguments) !== null;
    return named && argsAreObject && declaredNames.has(call.name);
}

/** Scores observed calls against the expectation: right names in any order, then argument fidelity. */
export function scoreCalls(expected: ExpectedToolCall[], observed: ObservedCall[]): { namesMatch: boolean; argumentMatchRate: number | null } {
    const expectedNames = [...expected.map((e) => e.toolName)].sort();
    const observedNames = [...observed.map((o) => o.name)].sort();
    const namesMatch = expectedNames.length === observedNames.length && expectedNames.every((n, i) => n === observedNames[i]);

    let checked = 0;
    let passed = 0;
    for (const expectation of expected) {
        // Score against the first observed call of that name; a duplicate call is a name-level
        // failure already counted above, and double-penalizing it would distort the param metric.
        const match = observed.find((o) => o.name === expectation.toolName);
        for (const matcher of expectation.arguments) {
            checked++;
            if (match && matchArgument(matcher, match.arguments)) {
                passed++;
            }
        }
    }
    return { namesMatch, argumentMatchRate: checked === 0 ? null : passed / checked };
}

/**
 * Whether the provider obeyed the cell's forcing semantics.
 *
 * `no-tools` and `auto` impose nothing, so they report `null` rather than a vacuous `true` — a
 * rate computed over cells that could not fail would be meaningless.
 */
export function evaluateToolChoice(mode: ProbeToolMode, forcedToolName: string | undefined, calls: ChatToolCall[]): boolean | null {
    switch (mode) {
        case 'none':
            return calls.length === 0;
        case 'required':
            return calls.length > 0;
        case 'named':
            return calls.length > 0 && calls.every((c) => c.name === forcedToolName);
        case 'no-tools':
        case 'auto':
            return null;
        default:
            return null;
    }
}

/** Picks the channel the model actually answered through. */
function classifyChannel(nativeCalls: number, envelopeCalls: number, envelopeParsed: boolean, textPresent: boolean): ObservedChannel {
    if (nativeCalls > 0) {
        return 'tool-call';
    }
    if (envelopeParsed && envelopeCalls > 0) {
        return 'envelope';
    }
    if (textPresent) {
        return envelopeParsed ? 'envelope' : 'text';
    }
    return 'empty';
}

/** Caps any single argument value so one runaway payload cannot bloat the whole records file. */
const MAX_ARGUMENT_CHARS = 400;

function truncateArguments(args: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
        const rendered = typeof value === 'string' ? value : JSON.stringify(value);
        out[key] = rendered !== undefined && rendered.length > MAX_ARGUMENT_CHARS
            ? `${rendered.slice(0, MAX_ARGUMENT_CHARS)}…[truncated]`
            : value;
    }
    return out;
}

/** The failed-call observation, so a provider error is a data point rather than a gap in the grid. */
function failedObservation(errorMessage: string): CellObservation {
    return {
        driverSucceeded: false, errorMessage, finishReason: null, streamingSuppressedForTools: false,
        textPresent: false, textLength: 0,
        nativeToolCallCount: 0, textAndCallsTogether: false, nativeCallsWellFormed: false, undeclaredToolNames: [],
        envelopeParsed: null, envelopeValid: null,
        channel: 'error', observedCallNames: [], observedArguments: [], decisionCorrect: false, argumentMatchRate: null,
        toolChoiceHonored: null, promptTokens: null, completionTokens: null
    };
}

/**
 * The evaluator. Everything above composes here.
 *
 * `toolsDeclared` is passed rather than inferred from the scenario because a `no-tools` cell runs
 * the same scenario with nothing declared — an undeclared-name check against the scenario's tool
 * list would then flag every envelope action as hallucinated.
 */
export function observeChatResult(
    result: ChatResult,
    scenario: ProbeScenario,
    mode: ProbeToolMode,
    toolsDeclared: boolean
): CellObservation {
    if (!result?.success) {
        return failedObservation(result?.errorMessage ?? 'Driver returned an unsuccessful result with no error message');
    }
    const choice = result.data?.choices?.[0];
    if (!choice) {
        return failedObservation('Driver reported success but returned no choices');
    }

    const text = choice.message?.content ?? '';
    const nativeCalls = choice.message?.toolCalls ?? [];
    const declaredNames = new Set(toolsDeclared ? scenario.tools.map((t) => t.name) : []);

    const envelope = scenario.expectation.envelopeRequested ? readEnvelope(text) : null;
    const envelopeCalls = envelopeActionsAsCalls(envelope?.envelope ?? null);
    // Native calls win: a model that emitted both has made its decision natively, and the envelope
    // is at most a narration of it.
    const observedCalls = nativeCalls.length > 0 ? nativeCallsAsObserved(nativeCalls) : envelopeCalls;

    const expectation: ProbeExpectation = scenario.expectation;
    const { namesMatch, argumentMatchRate } = scoreCalls(expectation.calls, observedCalls);
    const decisionCorrect = expectation.toolCallWarranted ? namesMatch : observedCalls.length === 0;

    const textPresent = text.trim().length > 0;
    return {
        driverSucceeded: true,
        errorMessage: null,
        finishReason: choice.finish_reason ?? null,
        streamingSuppressedForTools: result.modelSpecificResponseDetails?.streamingSuppressedForTools === true,
        textPresent,
        textLength: text.length,
        nativeToolCallCount: nativeCalls.length,
        textAndCallsTogether: textPresent && nativeCalls.length > 0,
        nativeCallsWellFormed: nativeCalls.every((c) => nativeCallWellFormed(c, declaredNames)),
        undeclaredToolNames: nativeCalls.map((c) => c.name).filter((n) => !declaredNames.has(n)),
        envelopeParsed: envelope ? envelope.parsed : null,
        envelopeValid: envelope ? envelope.valid : null,
        channel: classifyChannel(nativeCalls.length, envelopeCalls.length, envelope?.parsed ?? false, textPresent),
        observedCallNames: observedCalls.map((c) => c.name),
        observedArguments: observedCalls.map((c) => truncateArguments(c.arguments)),
        decisionCorrect,
        argumentMatchRate,
        toolChoiceHonored: evaluateToolChoice(mode, scenario.forcedToolName, nativeCalls),
        promptTokens: result.data?.usage?.promptTokens ?? null,
        completionTokens: result.data?.usage?.completionTokens ?? null
    };
}
