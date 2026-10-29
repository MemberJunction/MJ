/**
 * Byte-stability guard for the Loop Agent Type system prompt template.
 *
 * Renders the real template (`metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md`)
 * with a frozen context and compares it to a committed fixture. Any change to the rendered
 * prompt — reordering the cacheable prefix, bloating a catalog, moving a block — shows up here
 * as a reviewable diff instead of as a silent prompt-cache regression in production.
 *
 * Rendering uses core Nunjucks only. The template relies on nothing beyond `if/elif/else`,
 * `raw`, and the `safe` / `dump` filters, so a plain environment is faithful for a
 * stability check. (Production renders through the MJ TemplateEngine, which is also Nunjucks.)
 *
 * To intentionally accept a prompt change: review the diff, then run
 *   `pnpm vitest run loop-agent-system-prompt-snapshot -u`
 * from `packages/AI/Agents` and commit the updated fixture with the template change.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import nunjucks from 'nunjucks';
import { DEFAULT_LOOP_AGENT_PROMPT_PARAMS, LoopAgentTypePromptParams } from '../agent-types/loop-agent-prompt-params';
import { RUNTIME_STATE_TAG, AGENT_SPECIALIZATION_TAG } from '../constants';

const __dirname_ = dirname(fileURLToPath(import.meta.url));
// src/__tests__/ → repo root is 5 levels up (Agents → AI → packages → root).
const REPO_ROOT = join(__dirname_, '../../../../..');
const TEMPLATE_PATH = join(REPO_ROOT, 'metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md');
const FIXTURE_PATH = join(__dirname_, 'fixtures/loop-agent-system-prompt.default.snapshot.md');

/**
 * Frozen render context. Every value the template reads is pinned so the output is
 * deterministic across machines and dates. Volatile blocks get recognizable sentinel text
 * so their position in the rendered prompt is easy to find in a diff.
 */
function buildFrozenContext(promptParams: LoopAgentTypePromptParams, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ...extra,
        __agentTypePromptParams: promptParams,

        // Identity + child prompt
        agentName: 'Snapshot Agent',
        agentDescription: 'Fixture agent used only by the prompt snapshot test.',
        agentSpecificPrompt: '[[CHILD PROMPT — frozen for snapshot]]',
        parentAgentName: '',

        // Catalogs (empty, deterministic)
        actionCount: 0,
        actionDetails: '',
        subAgentCount: 0,
        subAgentDetails: '',
        skillCount: 0,
        skillsCatalog: '',
        clientToolDetails: '',
        appContext: '',

        // Tool blocks
        _ARTIFACT_MANIFEST: '',
        _ARTIFACT_TOOLS: '',
        _CONVERSATION_TOOLS: '',
        _PIPELINE_TOOLS: '',
        _MEMORY_WRITES_ENABLED: false,

        // Native tool calling off — the explicit JSON envelope path
        _NATIVE_TOOL_CALLING: false,
        _NATIVE_CONTROL_FLOW: 'explicit',

        // Plan mode off
        planModeActive: false,
        planApproved: false,

        // Volatile tail — frozen sentinels
        _CURRENT_DATE: '2026-01-01',
        _CURRENT_DAY_OF_WEEK: 'Thursday',
        _CURRENT_TIME: '12:00 PM UTC',
        _SCRATCHPAD_NOTES: '[[SCRATCHPAD NOTES — frozen]]',
        _SCRATCHPAD_TASK_SUMMARY: '0 of 0 tasks complete',
        _SCRATCHPAD_TASKS: '[[SCRATCHPAD TASKS — frozen]]',
        _CURRENT_PAYLOAD: { snapshot: 'frozen' },
    };
}

function renderSystemPrompt(promptParams: LoopAgentTypePromptParams, extra: Record<string, unknown> = {}): string {
    const env = new nunjucks.Environment(null, { autoescape: false, throwOnUndefined: false, trimBlocks: false, lstripBlocks: false });
    const template = readFileSync(TEMPLATE_PATH, 'utf8');
    return env.renderString(template, buildFrozenContext(promptParams, extra));
}

/** Renders with `overrides` applied over the frozen context — for keys the frozen context pins, such as the native flags. */
function renderSystemPromptWith(promptParams: LoopAgentTypePromptParams, overrides: Record<string, unknown>): string {
    const env = new nunjucks.Environment(null, { autoescape: false, throwOnUndefined: false, trimBlocks: false, lstripBlocks: false });
    const template = readFileSync(TEMPLATE_PATH, 'utf8');
    return env.renderString(template, { ...buildFrozenContext(promptParams), ...overrides });
}

describe('Loop Agent Type system prompt — rendered snapshot', () => {
    it('default params render byte-identically to the committed fixture', async () => {
        const rendered = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS });
        await expect(rendered).toMatchFileSnapshot(FIXTURE_PATH);
    });

    it('omits volatile blocks from the system prompt by default and renders the static pointer', () => {
        const rendered = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS });
        expect(rendered).not.toContain('## Current Date/Time');
        expect(rendered).not.toContain('## Scratchpad State');
        expect(rendered).not.toContain('## Current State');
        expect(rendered).not.toContain('2026-01-01');                 // no frozen date leaks in
        expect(rendered).not.toContain('SCRATCHPAD NOTES — frozen');
        expect(rendered).toContain('## Runtime State');
        expect(rendered).toContain(`\`<${RUNTIME_STATE_TAG}>\``);
        // The pointer is the LAST section — nothing volatile may follow it.
        expect(rendered.trimEnd().endsWith('and read it before responding.')).toBe(true);
        // Specialization stays in the system prompt unless relocation is flagged.
        expect(rendered).toContain('[[CHILD PROMPT — frozen for snapshot]]');
        expect(rendered).not.toContain(AGENT_SPECIALIZATION_TAG);
    });

    it('a stale volatileStatePlacement key in the params does not change the rendering', () => {
        const def = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS });
        const stale = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS, volatileStatePlacement: 'systemPrompt' } as Record<string, unknown>);
        expect(stale).toBe(def);
    });

    it('relocating the specialization swaps the child prompt for a stub and extends the pointer', () => {
        const relocated = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS }, { _SPECIALIZATION_RELOCATED: true });
        expect(relocated).not.toContain('[[CHILD PROMPT — frozen for snapshot]]');
        expect(relocated).toContain('## Specialization');
        expect(relocated).toContain(`\`<${AGENT_SPECIALIZATION_TAG}>\``);
        expect(relocated).toContain('immediately before the runtime state');
    });

    it('the pointer is omitted when state is disabled and nothing is relocated', () => {
        const none = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS, includeDateTimeInPrompt: false, includeScratchpadDocs: false, includePayloadInPrompt: false });
        expect(none).not.toContain('## Runtime State');
        expect(none).not.toContain('## Current Date/Time');
        // …but relocating the specialization alone is enough to bring the pointer back.
        const specOnly = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS, includeDateTimeInPrompt: false, includeScratchpadDocs: false, includePayloadInPrompt: false }, { _SPECIALIZATION_RELOCATED: true });
        expect(specOnly).toContain('## Runtime State');
    });

    it('the tag literals in the template match the code constants', () => {
        const template = readFileSync(TEMPLATE_PATH, 'utf8');
        expect(template).toContain(`<${RUNTIME_STATE_TAG}>`);
        expect(template).toContain(`<${AGENT_SPECIALIZATION_TAG}>`);
    });

    it('includes artifactDirective and Artifact Lifecycle section when _ARTIFACTS_ENABLED is true and omits both when false', () => {
        const enabled = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS }, { _ARTIFACTS_ENABLED: true });
        expect(enabled).toContain('artifactDirective?:');
        expect(enabled).toContain('## Artifact Lifecycle: Creating a New Artifact vs. Versioning an Existing One (`artifactDirective`)');

        const disabled = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS }, { _ARTIFACTS_ENABLED: false });
        expect(disabled).not.toContain('artifactDirective?:');
        expect(disabled).not.toContain('## Artifact Lifecycle: Creating a New Artifact vs. Versioning an Existing One (`artifactDirective`)');
    });
});

describe('Loop Agent Type system prompt — native-only control plane', () => {
    const NATIVE_ONLY_FIXTURE_PATH = join(__dirname_, 'fixtures/loop-agent-system-prompt.native-only.snapshot.md');
    /** Every capability on, so every section that could leak envelope wording is rendered. */
    const rich = {
        actionCount: 2, actionDetails: '[[ACTIONS]]', subAgentCount: 1, subAgentDetails: '[[SUB-AGENTS]]',
        skillCount: 1, skillsCatalog: '[[SKILLS]]', clientToolDetails: '[[CLIENT TOOLS]]',
        _ARTIFACT_MANIFEST: '[[MANIFEST — envelope]]', _ARTIFACT_MANIFEST_NATIVE: '[[MANIFEST — native]]', _ARTIFACT_TOOLS: '[[ARTIFACT TOOLS]]',
        _CONVERSATION_TOOLS: '[[CONVERSATION TOOLS — envelope]]', _CONVERSATION_TOOLS_NATIVE: '[[CONVERSATION TOOLS — native]]',
        _PIPELINE_TOOLS: '[[PIPELINE TOOLS]]', _MEMORY_WRITES_ENABLED: true, _ARTIFACTS_ENABLED: true,
        planModeActive: true, planApproved: false
    };
    const params = (): LoopAgentTypePromptParams => ({
        ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS,
        decisionsEnabled: true,
        includeDecisionsDocs: true,
        includeResponseTypeDefinition: { ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS.includeResponseTypeDefinition, tasks: true }
    } as LoopAgentTypePromptParams);
    const nativeOnly = (control: Record<string, unknown> = { Terminal: 'tool', PayloadChangeTool: true, AskUser: true }, extra: Record<string, unknown> = {}) =>
        renderSystemPromptWith(params(), {
            ...rich, _NATIVE_TOOL_CALLING: true, _NATIVE_CONTROL_FLOW: 'implicit', _NATIVE_ONLY_REQUESTED: true, _NATIVE_CONTROL: control, ...extra
        });

    it('renders byte-identically to the committed native-only fixture', async () => {
        await expect(nativeOnly()).toMatchFileSnapshot(NATIVE_ONLY_FIXTURE_PATH);
    });

    // Every native path is pinned, so a template edit aimed at one shows exactly what it does to the others.
    it.each([
        ['implicit control flow without NativeOnly', 'implicit', { _NATIVE_TOOL_CALLING: true, _NATIVE_CONTROL_FLOW: 'implicit' }],
        ['the hybrid (native Actions, envelope control)', 'hybrid', { _NATIVE_TOOL_CALLING: true, _NATIVE_CONTROL_FLOW: 'envelope' }],
        ['native-only with a text terminal', 'native-only-text', {
            _NATIVE_TOOL_CALLING: true, _NATIVE_CONTROL_FLOW: 'implicit', _NATIVE_ONLY_REQUESTED: true,
            _NATIVE_CONTROL: { Terminal: 'text', PayloadChangeTool: false, AskUser: true }
        }]
    ])('renders %s byte-identically to its committed fixture', async (_name, fixture, flags) => {
        const rendered = renderSystemPromptWith(params(), { ...rich, ...flags });
        await expect(rendered).toMatchFileSnapshot(join(__dirname_, `fixtures/loop-agent-system-prompt.${fixture}.snapshot.md`));
    });

    it('teaches no JSON envelope: no LoopAgentResponse, nextStep, taskComplete or envelope-only field', () => {
        const rendered = nativeOnly();
        for (const envelopeText of ['LoopAgentResponse', 'nextStep', 'taskComplete', 'artifactToolCalls', 'conversationToolCalls',
            'memoryWrites', 'actionableCommands', 'automaticCommands', 'finishIf', 'artifactDirective', 'messageIndex']) {
            expect(rendered, envelopeText).not.toContain(envelopeText);
        }
    });

    it('leaves out the capabilities that exist only as envelope steps', () => {
        const rendered = nativeOnly();
        for (const section of ['## Iterative Operations', '## Skills', '## Plan Mode', '## Client Tools', '## Durable Task Graphs',
            '## Message Expansion', '## Commands', '## Finishing after an action or sub-agent', '[[PIPELINE TOOLS]]', '[[SKILLS]]', '[[CLIENT TOOLS]]']) {
            expect(rendered, section).not.toContain(section);
        }
    });

    it('names the framework tools, and uses the native wording of the manifest and the conversation tools', () => {
        const rendered = nativeOnly();
        // conversation_tool is named by ConversationToolManager's native documentation, rendered in place of the sentinel.
        for (const tool of ['scratchpad_write', 'memory_write', 'artifact_tool', 'ask_decisions']) {
            expect(rendered, tool).toContain(`\`${tool}\``);
        }
        expect(rendered).toContain('[[MANIFEST — native]]');
        expect(rendered).not.toContain('[[MANIFEST — envelope]]');
        expect(rendered).toContain('[[CONVERSATION TOOLS — native]]');
        expect(rendered).not.toContain('[[CONVERSATION TOOLS — envelope]]');
    });

    it('under a text terminal with no payload tool, tells the model to finish in plain text and names neither tool', () => {
        const rendered = nativeOnly({ Terminal: 'text', PayloadChangeTool: false, AskUser: true });
        expect(rendered).toContain('reply in plain text');
        expect(rendered).not.toContain('complete_task');
        expect(rendered).not.toContain('payload_change_request');
    });

    it('renders the hybrid prompt unchanged when the agent asked for native-only but the model is not on implicit control flow', () => {
        const hybrid = { ...rich, _NATIVE_TOOL_CALLING: true, _NATIVE_CONTROL_FLOW: 'explicit' };
        const asked = renderSystemPromptWith(params(), { ...hybrid, _NATIVE_ONLY_REQUESTED: true, _NATIVE_CONTROL: { Terminal: 'text' } });
        const plain = renderSystemPromptWith(params(), hybrid);
        expect(asked).toBe(plain);
        expect(asked).toContain('LoopAgentResponse');
    });
});
