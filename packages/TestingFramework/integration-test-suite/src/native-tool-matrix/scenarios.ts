/**
 * scenarios.ts — the four probes the matrix sweeps, and the tools they offer.
 *
 * Deliberately tiny and domain-free. This is a DRIVER probe, not an agent eval: it measures what
 * the providers do with `ChatParams.tools`, so anything that could make one model look smarter
 * than another (long context, domain knowledge, a big action catalog) is noise here. A corpus comparison
 * (test plan §4) brings the real corpus.
 *
 * Every schema sticks to the cross-provider common subset named in `ChatTool.inputSchema` —
 * `type` / `description` / `enum` / `items` / `properties` / `required` — because Gemini's classic
 * function-declaration schema is an OpenAPI subset that rejects anything beyond it. A probe that
 * failed on schema translation would measure our mapping, not the provider.
 */
import type { ChatTool } from '@memberjunction/ai';
import type { ProbeResponseFormat, ProbeScenario } from './types';
import { BuildToolFromAction, GetActionFixture, type OpaqueStrategy, type ScalarStrategy } from './actionTools';

/** Looks up weather. The workhorse: one obvious call, one required argument, one enum. */
const GET_WEATHER: ChatTool = {
    name: 'get_weather',
    description: 'Get the current weather for a city. Call this whenever the user asks about weather conditions anywhere.',
    inputSchema: {
        type: 'object',
        properties: {
            location: { type: 'string', description: 'City name, e.g. "Paris" or "Tokyo".' },
            unit: { type: 'string', enum: ['celsius', 'fahrenheit'], description: 'Temperature unit.' }
        },
        required: ['location']
    }
};

/** Looks up the time. Exists so a single question can warrant TWO different calls at once. */
const GET_TIME: ChatTool = {
    name: 'get_time',
    description: 'Get the current local time in a time zone or city. Call this whenever the user asks what time it is somewhere.',
    inputSchema: {
        type: 'object',
        properties: {
            timezone: { type: 'string', description: 'IANA time zone or city name, e.g. "Asia/Tokyo" or "Tokyo".' }
        },
        required: ['timezone']
    }
};

/**
 * A stand-in for an MJ Action with a free-text parameter. Never the right answer in any scenario —
 * it is the distractor, so "called a declared tool" and "called the RIGHT declared tool" are
 * separable measurements rather than the same number.
 */
const RUN_QUERY: ChatTool = {
    name: 'run_query',
    description: 'Run a read-only SQL query against the application database. Call this only when the user asks for data that lives in the database.',
    inputSchema: {
        type: 'object',
        properties: {
            sql: { type: 'string', description: 'A single read-only SELECT statement.' },
            maxRows: { type: 'number', description: 'Maximum rows to return.' }
        },
        required: ['sql']
    }
};

const ALL_TOOLS: ChatTool[] = [GET_WEATHER, GET_TIME, RUN_QUERY];

/**
 * A minimal, faithful subset of MJ's `LoopAgentResponse` (`packages/AI/Agents/src/agent-types/
 * loop-agent-response-type.ts`) — enough to measure envelope compliance without dragging in the
 * 56–104KB prose action catalog that native declarations exist to delete. The three fields kept are the ones
 * the loop actually branches on.
 */
const ENVELOPE_SYSTEM_PROMPT = [
    'You are an agent inside a framework that reads your reply as JSON. Reply with a single raw JSON',
    'object and nothing else — no prose, no markdown fence — conforming to this interface:',
    '',
    '  {',
    '    "taskComplete": boolean,           // true ends the loop',
    '    "message": string,                 // required when nextStep.type is "Chat"',
    '    "nextStep": {                      // required when taskComplete is false',
    '      "type": "Actions" | "Chat",',
    '      "actions": [ { "name": string, "params": object } ]   // when type is "Actions"',
    '    }',
    '  }',
    '',
    'The actions available to you are:',
    '  - get_weather(location: string, unit?: "celsius" | "fahrenheit") — current weather for a city',
    '  - get_time(timezone: string) — current local time in a time zone or city',
    '  - run_query(sql: string, maxRows?: number) — run a read-only SQL query'
].join('\n');

/**
 * The four probes.
 *
 * Each answers a different question, and the interesting numbers come from the CROSS of a scenario
 * with a tool mode — e.g. `no-call-needed × required` measures what forcing a call costs when no
 * call is warranted, which is exactly the policy question §8.3 of the implementation plan defers.
 */
export const PROBE_SCENARIOS: ProbeScenario[] = [
    {
        id: 'single-call',
        purpose: 'One obvious call. Baseline for call well-formedness, name accuracy and whether text accompanies a call.',
        userPrompt: 'What is the weather in Paris right now?',
        tools: ALL_TOOLS,
        forcedToolName: 'get_weather',
        expectation: {
            toolCallWarranted: true,
            calls: [{ toolName: 'get_weather', arguments: [{ kind: 'containsIgnoreCase', parameter: 'location', value: 'paris' }] }],
            envelopeRequested: false
        }
    },
    {
        id: 'parallel-call',
        purpose: 'Two independent calls warranted in one turn. Measures parallel-call behavior, which is not uniform even within one vendor (audit §7.4).',
        userPrompt: 'What is the weather in Paris, and what time is it in Tokyo right now?',
        tools: ALL_TOOLS,
        forcedToolName: 'get_weather',
        expectation: {
            toolCallWarranted: true,
            calls: [
                { toolName: 'get_weather', arguments: [{ kind: 'containsIgnoreCase', parameter: 'location', value: 'paris' }] },
                { toolName: 'get_time', arguments: [{ kind: 'containsIgnoreCase', parameter: 'timezone', value: 'tokyo' }] }
            ],
            envelopeRequested: false
        }
    },
    {
        id: 'no-call-needed',
        purpose: 'Tools declared, but the question is general knowledge. A call here is a FAILURE — the coherence probe for a hybrid loop.',
        userPrompt: 'In one short sentence, what is the capital of France?',
        tools: ALL_TOOLS,
        expectation: { toolCallWarranted: false, calls: [], envelopeRequested: false }
    },
    {
        id: 'envelope',
        purpose: "MJ's envelope asked for in the system prompt WHILE tools are declared. Measures whether declaring tools breaks the JSON contract the loop depends on (§5.6) and which channel the model picks.",
        systemPrompt: ENVELOPE_SYSTEM_PROMPT,
        userPrompt: 'Find out the weather in Paris.',
        tools: ALL_TOOLS,
        forcedToolName: 'get_weather',
        expectation: {
            toolCallWarranted: true,
            calls: [{ toolName: 'get_weather', arguments: [{ kind: 'containsIgnoreCase', parameter: 'location', value: 'paris' }] }],
            envelopeRequested: true
        }
    }
];

/**
 * Appended to the user turn in every `responseFormat: 'JSON'` cell.
 *
 * Not cosmetic: OpenAI's `response_format: { type: 'json_object' }` — what MJ's `responseFormat:
 * 'JSON'` maps to — returns a 400 unless the word "json" appears somewhere in the messages, and MJ
 * does not add it. Without this suffix every OpenAI JSON cell would fail identically and the matrix
 * would measure our request construction rather than the tools × JSON-mode interaction it exists to
 * measure. The suffix is a constant so the two arms of the responseFormat axis differ by exactly one
 * known sentence. (That MJ leaves the requirement to the caller is itself a finding — see the
 * write-up; it is not something this rig should paper over silently.)
 */
export const JSON_MODE_PROMPT_SUFFIX = '\n\nReply in JSON.';

/** The user turn for a cell — the scenario's prompt, plus the JSON-mode suffix when it applies. */
export function BuildUserPrompt(scenario: ProbeScenario, responseFormat: ProbeResponseFormat): string {
    return responseFormat === 'JSON' ? scenario.userPrompt + JSON_MODE_PROMPT_SUFFIX : scenario.userPrompt;
}

/** @deprecated Use {@link BuildUserPrompt}. */
export function buildUserPrompt(scenario: ProbeScenario, responseFormat: ProbeResponseFormat): string {
    return BuildUserPrompt(scenario, responseFormat);
}

/** Looks a scenario up by id, throwing rather than returning undefined — a typo is a config bug. */
export function GetScenario(id: string): ProbeScenario {
    const all = [...PROBE_SCENARIOS, ...MJ_ACTION_SCENARIOS];
    const found = all.find((s) => s.id === id);
    if (!found) {
        throw new Error(`Unknown probe scenario '${id}'. Known: ${all.map((s) => s.id).join(', ')}`);
    }
    return found;
}

/** @deprecated Use {@link GetScenario}. */
export function getScenario(id: string): ProbeScenario {
    return GetScenario(id);
}

// ────────────────────────────────────────────────────────────────────────────
// MJ Action scenarios — measuring the §8.2 mapping itself, not provider behavior
// ────────────────────────────────────────────────────────────────────────────

/**
 * The three real Actions the mapping probes use.
 *
 * Chosen to span the interesting axes rather than for coverage: `Calculate Expression` is the
 * minimum viable Action (one required Scalar, verifiable answer); `Run Ad-hoc Query` is the
 * realistic one (nine params, two of them `ValueType: 'Other'`, which the permissive mapping
 * flattens to an untyped object); `Get Entity Details` exists so the model has to *choose* among
 * plausible MJ actions rather than call the only thing on offer.
 */
const MJ_ACTION_NAMES = ['Calculate Expression', 'Run Ad-hoc Query', 'Get Entity Details'];

function mjActionTools(strategy: ScalarStrategy, opaque: OpaqueStrategy): ChatTool[] {
    return MJ_ACTION_NAMES.map((name) => BuildToolFromAction(GetActionFixture(name), strategy, opaque));
}

/**
 * Builds the pair of MJ-action scenarios for one scalar strategy.
 *
 * Both strategies get the SAME prompts and the SAME expectations, so the only thing that differs
 * between the two arms is the schema §8.2 emits for a `Scalar` param. That is what makes the
 * comparison a measurement of the mapping rather than of the model.
 */
function mjActionScenarios(strategy: ScalarStrategy, opaque: OpaqueStrategy = 'object'): ProbeScenario[] {
    const tools = mjActionTools(strategy, opaque);
    // Arm id: the scalar strategy, plus an explicit marker when the opaque mapping also changes.
    const suffix = opaque === 'string' ? 'opaquestr' : (strategy === 'union' ? 'union' : 'string');
    return [
        {
            id: `mj-action-calc-${suffix}`,
            purpose: `Real MJ Actions as tools, Scalar mapped per §8.2 '${strategy}'. One required Scalar param; the model must pick Calculate Expression over two plausible siblings.`,
            userPrompt: 'What is (2*3)+4/15?',
            tools,
            forcedToolName: 'calculate_expression',
            expectation: {
                toolCallWarranted: true,
                calls: [{ toolName: 'calculate_expression', arguments: [{ kind: 'nonEmptyString', parameter: 'Expression' }] }],
                envelopeRequested: false
            }
        },
        {
            id: `mj-action-query-${suffix}`,
            purpose: `Real MJ Actions as tools, Scalar mapped per §8.2 '${strategy}'. Nine params including two ValueType 'Other' — the case the permissive mapping flattens to an untyped object.`,
            userPrompt: 'How many rows are in the AI Agents table in the database? Query it.',
            tools,
            forcedToolName: 'run_ad_hoc_query',
            expectation: {
                toolCallWarranted: true,
                calls: [{ toolName: 'run_ad_hoc_query', arguments: [{ kind: 'nonEmptyString', parameter: 'Query' }] }],
                envelopeRequested: false
            }
        }
    ];
}

/**
 * The §8.2 mapping probes.
 *
 * Kept OUT of {@link PROBE_SCENARIOS} on purpose: those measure what providers do with tools, and
 * belong in the default sweep; these measure what providers do with *our proposed schema*, are a
 * design question for the framework, and would otherwise multiply the default matrix's cost. Run them
 * explicitly with `--scenarios mj-action-calc-union,...`.
 */
export const MJ_ACTION_SCENARIOS: ProbeScenario[] = [
    ...mjActionScenarios('union'),
    ...mjActionScenarios('string'),
    // The opaque-type arm: identical in every respect except how a non-Scalar param is typed.
    ...mjActionScenarios('string', 'string')
];
