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
});
