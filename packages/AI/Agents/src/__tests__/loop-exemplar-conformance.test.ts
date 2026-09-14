/**
 * loop-exemplar-conformance.test.ts — the shipped exemplars must match the type they teach.
 *
 * Every agent prompt under `metadata/prompts/` shows the model JSON examples of what to emit, and
 * models copy those shapes closely. When an exemplar contradicts `LoopAgentResponse`, the model
 * emits the contradiction and the framework rejects it — which reads as "the model produced a
 * malformed response" when it in fact produced exactly what we asked for. That is the failure
 * class the native-tool-calling plan calls out in §9.4, where a single corrected exemplar moved
 * one agent's malformed rate from ~35% to ~10%.
 *
 * The audit that introduced this file found twenty such defects across eight files, including
 * shapes that could never succeed:
 *   - `nextStep.message` on a Chat step (message is TOP-LEVEL; the runtime forces a Retry without it)
 *   - `"type": "Action"` / `"type": "chat"` — wrong word, wrong case; the dispatcher switches
 *      case-sensitively on the canonical spelling and falls through to Retry
 *   - `action: {name, input}` instead of `actions: [{name, params}]`
 *   - `nextStep: {type: "Success"}` alongside `taskComplete: true` — validation rejects it before
 *      the taskComplete short-circuit is ever reached
 *   - invented keys (`subAgent.payload`, `suggestedResponses`, `finalCode`) that are silently dropped
 *   - JSON that does not parse: a trailing comma, raw newlines inside a string, a `//` comment
 *
 * None of that is catchable by reading a prompt. It is catchable by parsing it, which is what this
 * does. The step-type list comes from {@link LOOP_NEXT_STEP_TYPES}, which is itself compile-time
 * bound to the interface — so adding a step type re-checks every exemplar rather than silently
 * widening what counts as valid.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { LOOP_NEXT_STEP_TYPES } from '../agent-types/loop-agent-response-type';
import { ASK_USER_TOOL, PAYLOAD_CHANGE_TOOL, SUB_AGENT_TOOL_PREFIX } from '../native-tools/control-tools';

const __dirname_ = dirname(fileURLToPath(import.meta.url));
// src/__tests__/ → repo root is 5 levels up (Agents → AI → packages → root).
const REPO_ROOT = join(__dirname_, '../../../../..');
const TEMPLATES_DIR = join(REPO_ROOT, 'metadata/prompts/templates');
const OUTPUT_DIR = join(REPO_ROOT, 'metadata/prompts/output');

/** Top-level fields on `LoopAgentResponse`. Anything else is silently dropped at runtime. */
const TOP_LEVEL_FIELDS = new Set([
    'taskComplete', 'message', 'responseForm', 'actionableCommands', 'automaticCommands',
    'payloadChangeRequest', 'scratchpad', 'artifactToolCalls', 'conversationToolCalls',
    'memoryWrites', 'reasoning', 'confidence', 'nextStep'
]);
const NEXT_STEP_FIELDS = new Set([
    'type', 'actions', 'pipeline', 'messageIndex', 'reason', 'subAgent', 'subAgents',
    'clientTools', 'forEach', 'while', 'skills', 'plan', 'tasks', 'taskGraph'
]);
const ACTION_FIELDS = new Set(['name', 'params']);
const SUB_AGENT_FIELDS = new Set(['name', 'message', 'templateParameters', 'terminateAfter']);
const PAYLOAD_CHANGE_FIELDS = new Set(['newElements', 'updateElements', 'removeElements', 'replaceElements', 'reasoning']);

const VALID_STEP_TYPES = new Set<string>(LOOP_NEXT_STEP_TYPES);
const STEP_TYPES_BY_LOWERCASE = new Map(LOOP_NEXT_STEP_TYPES.map((t) => [t.toLowerCase(), t]));

interface Exemplar {
    /** `path:line` for templates, `path#exampleKey` for the output JSON files. */
    location: string;
    json: string;
}

function walk(dir: string, extension: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            found.push(...walk(full, extension));
        } else if (entry.endsWith(extension)) {
            found.push(full);
        }
    }
    return found;
}

/** Index just past the object starting at `text[start]`, respecting strings and escapes. */
function endOfObject(text: string, start: number): number | null {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
        const char = text[i];
        if (escaped) {
            escaped = false;
        } else if (char === '\\' && inString) {
            escaped = true;
        } else if (char === '"') {
            inString = !inString;
        } else if (!inString) {
            if (char === '{') {
                depth++;
            } else if (char === '}' && --depth === 0) {
                return i + 1;
            }
        }
    }
    return null;
}

/**
 * Pulls brace-matched objects out of a markdown file.
 *
 * Brace matching rather than fence matching, and blockquote markers stripped first: several
 * exemplars live inside `>` quotes, and several embed a nested ``` fence inside a string value —
 * both of which defeat a naive fence regex, and both of which hid real defects until the audit
 * stopped using one.
 */
function exemplarsInMarkdown(file: string): Exemplar[] {
    const text = readFileSync(file, 'utf8').split('\n').map((line) => line.replace(/^\s*> ?/, '')).join('\n');
    const found: Exemplar[] = [];
    for (const match of text.matchAll(/^\{$/gm)) {
        const start = match.index ?? 0;
        const end = endOfObject(text, start);
        const body = end === null ? null : text.slice(start, end);
        if (body && (body.includes('taskComplete') || body.includes('"nextStep"'))) {
            found.push({ location: `${relative(REPO_ROOT, file)}:${text.slice(0, start).split('\n').length}`, json: body });
        }
    }
    return found;
}

/**
 * `OutputExample` files are either one response or a map of named examples. Both forms are shown
 * to the model verbatim, so both are held to the contract — the wrapper's own `description` keys
 * are the one documented exception.
 */
function exemplarsInOutputFile(file: string): Array<{ location: string; value: Record<string, unknown>; wrapped: boolean }> {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
        return [];
    }
    const root = parsed as Record<string, unknown>;
    const shortPath = relative(REPO_ROOT, file);
    const found: Array<{ location: string; value: Record<string, unknown>; wrapped: boolean }> = [];
    if ('taskComplete' in root || 'nextStep' in root) {
        found.push({ location: shortPath, value: root, wrapped: false });
    }
    for (const [key, value] of Object.entries(root)) {
        if (typeof value === 'object' && value !== null && ('taskComplete' in value || 'nextStep' in value)) {
            found.push({ location: `${shortPath}#${key}`, value: value as Record<string, unknown>, wrapped: true });
        }
    }
    return found;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Every way one exemplar can contradict `LoopAgentResponse`, as human-readable strings. */
function conformanceProblems(response: Record<string, unknown>, allowDescription: boolean): string[] {
    const problems: string[] = [];
    const unknownKeys = Object.keys(response).filter((k) => !TOP_LEVEL_FIELDS.has(k) && !(allowDescription && k === 'description'));
    for (const key of unknownKeys) {
        problems.push(`'${key}' is not a LoopAgentResponse field — it is silently dropped`);
    }
    if ('taskComplete' in response && typeof response.taskComplete !== 'boolean') {
        problems.push(`taskComplete must be a boolean, got ${JSON.stringify(response.taskComplete)}`);
    }
    const changeRequest = asRecord(response.payloadChangeRequest);
    for (const key of Object.keys(changeRequest ?? {})) {
        if (!PAYLOAD_CHANGE_FIELDS.has(key)) {
            problems.push(`payloadChangeRequest.${key} is not a change-request operation`);
        }
    }

    const nextStep = asRecord(response.nextStep);
    if (!nextStep) {
        return problems;
    }
    const type = nextStep.type;
    if (typeof type === 'string' && !VALID_STEP_TYPES.has(type)) {
        const canonical = STEP_TYPES_BY_LOWERCASE.get(type.toLowerCase());
        problems.push(canonical
            ? `nextStep.type '${type}' is the wrong case — the dispatcher switches on '${canonical}' and falls through to Retry`
            : `nextStep.type '${type}' is not a step type`);
    }
    for (const key of Object.keys(nextStep)) {
        if (!NEXT_STEP_FIELDS.has(key)) {
            problems.push(`nextStep.${key} is not a nextStep field${key === 'message' ? " — message is TOP-LEVEL, and a Chat step without it forces a Retry" : ''}`);
        }
    }
    const actions = Array.isArray(nextStep.actions) ? nextStep.actions : [];
    for (const action of actions) {
        for (const key of Object.keys(asRecord(action) ?? {})) {
            if (!ACTION_FIELDS.has(key)) {
                problems.push(`nextStep.actions[].${key} is not an action field (expected name/params)`);
            }
        }
    }
    const single = asRecord(nextStep.subAgent);
    const many = (Array.isArray(nextStep.subAgents) ? nextStep.subAgents : []).map(asRecord);
    for (const subAgent of [single, ...many]) {
        for (const key of Object.keys(subAgent ?? {})) {
            if (!SUB_AGENT_FIELDS.has(key)) {
                problems.push(`nextStep.subAgent.${key} is not a sub-agent field — the runtime maps only ${[...SUB_AGENT_FIELDS].join('/')}`);
            }
        }
    }
    return problems;
}

const templateExemplars = walk(TEMPLATES_DIR, '.md').flatMap(exemplarsInMarkdown);
const outputExemplars = walk(OUTPUT_DIR, '.json').flatMap(exemplarsInOutputFile);

describe('shipped LoopAgentResponse exemplars', () => {
    it('finds exemplars to check — a silent zero would make every assertion below vacuous', () => {
        expect(templateExemplars.length).toBeGreaterThan(50);
        expect(outputExemplars.length).toBeGreaterThan(20);
    });

    it.each(templateExemplars.map((e) => [e.location, e] as const))('%s is valid JSON', (_location, exemplar) => {
        // A prompt exemplar that does not parse teaches the model to emit JSON that does not parse.
        expect(() => JSON.parse(exemplar.json) as unknown).not.toThrow();
    });

    it.each(templateExemplars.map((e) => [e.location, e] as const))('%s matches LoopAgentResponse', (_location, exemplar) => {
        const parsed = asRecord(JSON.parse(exemplar.json));
        expect(parsed).not.toBeNull();
        expect(conformanceProblems(parsed as Record<string, unknown>, false)).toEqual([]);
    });

    it.each(outputExemplars.map((e) => [e.location, e] as const))('%s matches LoopAgentResponse', (_location, exemplar) => {
        expect(conformanceProblems(exemplar.value, exemplar.wrapped)).toEqual([]);
    });
});

describe('OutputExample files', () => {
    // AIPromptRunner parses OutputExample and validates the model's output against it. An
    // unparseable one fails EVERY run of a Strict prompt regardless of what the model produced —
    // which is exactly what `database-schema-designer.example.json` did before this audit.
    it.each(walk(OUTPUT_DIR, '.json').map((f) => [relative(REPO_ROOT, f), f] as const))('%s parses', (_short, file) => {
        expect(() => JSON.parse(readFileSync(file, 'utf8')) as unknown).not.toThrow();
    });
});

describe('Loop system prompt — implicit-mode section matches the code', () => {
    const template = readFileSync(join(TEMPLATES_DIR, 'system/loop-agent-type-system-prompt.template.md'), 'utf8');
    const start = template.indexOf("{%- if _NATIVE_TOOL_CALLING and _NATIVE_CONTROL_FLOW == 'implicit' %}");
    const end = template.indexOf('{%- elif actionCount > 0 and _NATIVE_TOOL_CALLING %}', start);
    const section = start >= 0 && end > start ? template.slice(start, end) : '';

    it('has an implicit-mode section', () => { expect(section.length).toBeGreaterThan(200); });
    it('names the control tools the code exports', () => {
        expect(section).toContain(`\`${ASK_USER_TOOL}\``);
        expect(section).toContain(`\`${PAYLOAD_CHANGE_TOOL}\``);
        expect(section).toContain(SUB_AGENT_TOOL_PREFIX);
    });
    it('tells the model plain text ends the turn', () => { expect(section).toMatch(/plain text/i); });
    it('tells the model not to ask when a sub-agent or Action can supply the answer (Plan B, Task 2)', () => {
        expect(section).toMatch(/never for work a sub-agent or an Action can do/i);
    });
    it('never instructs an envelope step the implicit protocol removed', () => {
        for (const forbidden of ['"type": "Sub-Agent"', "type: 'Sub-Agent'", '"type": "Chat"', "type: 'Chat'", "type: 'Actions'"]) {
            expect(section).not.toContain(forbidden);
        }
    });
    it('drops Sub-Agent and Chat from the nextStep.type union in implicit mode', () => {
        expect(template).toContain("{% if _NATIVE_CONTROL_FLOW != 'implicit' %}'Sub-Agent' | 'Chat' | {% endif %}");
    });
});
