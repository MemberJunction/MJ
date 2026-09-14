/**
 * corpus.ts — the golden-file case format, its loader, and `anyOf`.
 *
 * Corpus cases are golden JSON files (test plan §4.2) rather than rows in a table, because inputs
 * and expectations have to be **reviewable and diffable**: a change to what a case expects is a
 * change to the yardstick, and that must show up in a code review rather than in a metadata push.
 *
 * The on-disk format is the plan's, verbatim — `{ "matcher": "regex", "pattern": … }` with an
 * `optional` flag — while the evaluator's internal {@link ParamMatcher} is a discriminated union.
 * This module is the translation, and it exists precisely so the two can differ: the file format
 * is optimized for a human writing and reviewing it, the internal type for exhaustive checking.
 *
 * Loading VALIDATES. An unknown matcher name, a missing pattern, an unknown expectation kind — all
 * throw here, at load time, naming the case. The alternative is a matcher that silently never
 * matches, which would look exactly like a model failure in the results.
 *
 * FRAMEWORK-FREE (test plan §2.1) — imports nothing from the testing engine.
 */
import type { DecisionKind, ObservedDecision } from './decision';
import type { ParamExpectation, ParamMatcher } from './matchers';
import type { ChatMessage } from '@memberjunction/ai';
import { evaluateDecision, type DecisionEvaluation, type DecisionExpectation, type ExpectedAction } from './expectation';

/** A parameter matcher as written in a golden file. */
export interface CorpusParamMatcher {
    matcher: 'exact' | 'regex' | 'oneOf' | 'contains' | 'nonEmpty' | 'numericTolerance' | 'typeOf' | 'absent';
    value?: unknown;
    values?: unknown[];
    pattern?: string;
    flags?: string;
    /** For `numericTolerance`: the permitted absolute deviation from `value`. */
    tolerance?: number;
    /** For `typeOf`. */
    type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
    /** Absent is acceptable; a present value is still checked. */
    optional?: boolean;
}

/** One expected action in a golden file. */
export interface CorpusExpectedAction {
    name: string;
    params?: Record<string, CorpusParamMatcher>;
}

/** One expectation in a golden file. `anyOf` nests alternatives. */
export interface CorpusExpectation {
    kind: DecisionKind | 'anyOf';
    actions?: CorpusExpectedAction[];
    subAgents?: string[];
    message?: CorpusParamMatcher;
    forbiddenActions?: string[];
    ordered?: boolean;
    allowAdditionalActions?: boolean;
    /** Matchers keyed by dotted path into the payload change request, e.g. `newElements.findings`. */
    payload?: Record<string, CorpusParamMatcher>;
    /** Dotted paths the payload change must not touch (payload scoping). */
    forbiddenPayloadPaths?: string[];
    /** Alternatives, when `kind` is `anyOf`. The best-scoring branch wins. */
    anyOf?: CorpusExpectation[];
}

/** A corpus case, as it appears on disk. */
export interface CorpusCase {
    id: string;
    /** The agent whose prompt this case exercises. */
    agent: string;
    description: string;
    input: {
        payload?: Record<string, unknown>;
        /** Prior turns. Multi-turn cases use the neutral tool form: assistant `toolCalls` + a `tool` turn of `tool_result` blocks; `encodeHistoryForArm` renders it per arm. */
        conversationMessages?: ChatMessage[];
        templateData?: Record<string, unknown>;
        /** Forces the model's tool choice on native cells — 'none' for forced-control-flow cases, which production runs at 'none' on the final iteration. */
        toolChoice?: 'auto' | 'none' | 'required';
    };
    expect: CorpusExpectation;
    /** Free-form tags for slicing the corpus — category, provider focus, stage. */
    tags?: string[];
}

function fail(caseId: string, message: string): never {
    throw new Error(`Corpus case '${caseId}': ${message}`);
}

/** Translates one on-disk matcher into the evaluator's union, rejecting anything malformed. */
export function toParamMatcher(caseId: string, param: string, spec: CorpusParamMatcher): ParamMatcher {
    switch (spec.matcher) {
        case 'exact':
            return { kind: 'exact', value: spec.value };
        case 'nonEmpty':
            // A payload path may hold an array or object, not only a string.
            return { kind: 'nonEmpty' };
        case 'contains':
            if (typeof spec.value !== 'string') {
                fail(caseId, `param '${param}': 'contains' requires a string 'value'`);
            }
            return { kind: 'containsIgnoreCase', value: spec.value };
        case 'oneOf':
            if (!Array.isArray(spec.values) || spec.values.length === 0) {
                fail(caseId, `param '${param}': 'oneOf' requires a non-empty 'values' array`);
            }
            return { kind: 'oneOf', values: spec.values };
        case 'regex':
            if (typeof spec.pattern !== 'string') {
                fail(caseId, `param '${param}': 'regex' requires a 'pattern'`);
            }
            // Compile now so a bad pattern fails at load, not silently at scoring time.
            try {
                new RegExp(spec.pattern, spec.flags);
            } catch (error) {
                fail(caseId, `param '${param}': invalid regex — ${(error as Error).message}`);
            }
            return { kind: 'regex', pattern: spec.pattern, flags: spec.flags };
        case 'numericTolerance': {
            if (typeof spec.value !== 'number' || typeof spec.tolerance !== 'number') {
                fail(caseId, `param '${param}': 'numericTolerance' requires numeric 'value' and 'tolerance'`);
            }
            return { kind: 'numberRange', min: spec.value - spec.tolerance, max: spec.value + spec.tolerance };
        }
        case 'typeOf':
            if (!spec.type) {
                fail(caseId, `param '${param}': 'typeOf' requires a 'type'`);
            }
            return { kind: 'typeOf', type: spec.type };
        case 'absent':
            return { kind: 'absent' };
        default:
            fail(caseId, `param '${param}': unknown matcher '${String(spec.matcher)}'`);
    }
}

const DECISION_KINDS: DecisionKind[] = ['action', 'subAgent', 'chat', 'taskComplete', 'payloadChange', 'other', 'unparseable', 'empty'];

function toParamExpectations(caseId: string, params: Record<string, CorpusParamMatcher> | undefined): ParamExpectation[] {
    return Object.entries(params ?? {}).map(([param, spec]) => ({
        param,
        matcher: toParamMatcher(caseId, param, spec),
        optional: spec.optional === true
    }));
}

function toExpectedActions(caseId: string, actions: CorpusExpectedAction[] | undefined): ExpectedAction[] | undefined {
    return actions?.map((action) => {
        if (!action.name) {
            fail(caseId, 'every expected action needs a name');
        }
        return { name: action.name, params: toParamExpectations(caseId, action.params) };
    });
}

/** Translates a golden-file expectation into the evaluator's {@link DecisionExpectation}. */
export function toDecisionExpectation(caseId: string, expect: CorpusExpectation): DecisionExpectation {
    if (!DECISION_KINDS.includes(expect.kind as DecisionKind)) {
        fail(caseId, `unknown expectation kind '${expect.kind}'`);
    }
    if (expect.kind === 'action' && !expect.actions?.length) {
        fail(caseId, "kind 'action' requires at least one expected action");
    }
    return {
        kind: expect.kind as DecisionKind,
        actions: toExpectedActions(caseId, expect.actions),
        subAgents: expect.subAgents,
        message: expect.message ? toParamMatcher(caseId, 'message', expect.message) : undefined,
        forbiddenActions: expect.forbiddenActions,
        ordered: expect.ordered,
        allowAdditionalActions: expect.allowAdditionalActions,
        payload: expect.payload ? toParamExpectations(caseId, expect.payload) : undefined,
        forbiddenPayloadPaths: expect.forbiddenPayloadPaths
    };
}

/** Validates a parsed golden file and returns it typed. Throws with the case id on any problem. */
export function parseCorpusCase(raw: unknown): CorpusCase {
    const record = raw as Partial<CorpusCase> | null;
    if (!record || typeof record !== 'object') {
        throw new Error('Corpus case must be a JSON object');
    }
    const id = record.id;
    if (typeof id !== 'string' || id.length === 0) {
        throw new Error("Corpus case must have a non-empty 'id'");
    }
    if (typeof record.agent !== 'string' || record.agent.length === 0) {
        fail(id, "must name the 'agent' whose prompt it exercises");
    }
    if (!record.expect) {
        fail(id, "must declare an 'expect'");
    }
    const toolChoice = (record.input as { toolChoice?: unknown } | undefined)?.toolChoice;
    if (toolChoice !== undefined && !['auto', 'none', 'required'].includes(String(toolChoice))) {
        fail(id, `input.toolChoice must be 'auto' | 'none' | 'required', got '${String(toolChoice)}'`);
    }
    // Compile every matcher now: a corpus that loads is a corpus that can score.
    validateExpectation(id, record.expect);
    return { ...record, id, agent: record.agent, description: record.description ?? '', input: record.input ?? {}, expect: record.expect } as CorpusCase;
}

function validateExpectation(caseId: string, expect: CorpusExpectation): void {
    if (expect.kind === 'anyOf') {
        if (!expect.anyOf?.length) {
            fail(caseId, "kind 'anyOf' requires a non-empty 'anyOf' array");
        }
        expect.anyOf.forEach((branch) => validateExpectation(caseId, branch));
        return;
    }
    toDecisionExpectation(caseId, expect);
}

/**
 * Scores an observation against a case's expectation, resolving `anyOf`.
 *
 * `anyOf` takes the **best-scoring** branch rather than the first passing one. Both give the same
 * pass/fail, but the score differs when every branch fails, and reporting the closest miss is what
 * makes a failure diagnosable: "expected chat OR action, got unparseable" is less useful than the
 * branch that came nearest.
 */
export function evaluateCorpusExpectation(caseId: string, expect: CorpusExpectation, observed: ObservedDecision): DecisionEvaluation {
    if (expect.kind !== 'anyOf') {
        return evaluateDecision(toDecisionExpectation(caseId, expect), observed);
    }
    const branches = (expect.anyOf ?? []).map((branch) => evaluateCorpusExpectation(caseId, branch, observed));
    const passing = branches.find((b) => b.passed);
    if (passing) {
        return passing;
    }
    return branches.reduce((best, current) => (current.score > best.score ? current : best), branches[0]);
}
