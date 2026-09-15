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
import { RUNTIME_STATE_TAG, AGENT_SPECIALIZATION_TAG } from '../runtime-state-fragment';

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

    it('renders the three volatile blocks at the tail under default placement', () => {
        const rendered = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS });
        const dateAt = rendered.indexOf('## Current Date/Time');
        const scratchAt = rendered.indexOf('## Scratchpad State');
        const payloadAt = rendered.indexOf('## Current State');
        expect(dateAt).toBeGreaterThan(0);
        expect(scratchAt).toBeGreaterThan(dateAt);
        expect(payloadAt).toBeGreaterThan(scratchAt);
        // Nothing but the payload block follows the payload header — it is the last section.
        expect(rendered.slice(payloadAt)).not.toMatch(/\n## /);
    });

    it('trailingMessage placement OMITS the three volatile blocks and adds the static pointer instead', () => {
        const trailing = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS, volatileStatePlacement: 'trailingMessage' });
        expect(trailing).not.toContain('## Current Date/Time');
        expect(trailing).not.toContain('## Scratchpad State');
        expect(trailing).not.toContain('## Current State');
        expect(trailing).not.toContain('2026-01-01');                 // no frozen date leaks in
        expect(trailing).not.toContain('SCRATCHPAD NOTES — frozen');
        expect(trailing).toContain('## Runtime State');
        expect(trailing).toContain(`\`<${RUNTIME_STATE_TAG}>\``);
        // The pointer is the LAST section — nothing volatile may follow it.
        expect(trailing.trimEnd().endsWith('and read it before responding.')).toBe(true);
        // Specialization stays in the system prompt unless relocation is flagged.
        expect(trailing).toContain('[[CHILD PROMPT — frozen for snapshot]]');
        expect(trailing).not.toContain(AGENT_SPECIALIZATION_TAG);
    });

    it('trailingMessage placement is otherwise byte-identical to the default up to the volatile tail', () => {
        const def = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS });
        const trailing = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS, volatileStatePlacement: 'trailingMessage' });
        const cut = def.indexOf('## Current Date/Time');
        expect(cut).toBeGreaterThan(0);
        expect(trailing.slice(0, cut)).toBe(def.slice(0, cut));
    });

    it('relocating the specialization swaps the child prompt for a stub and extends the pointer', () => {
        const relocated = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS, volatileStatePlacement: 'trailingMessage' }, { _SPECIALIZATION_RELOCATED: true });
        expect(relocated).not.toContain('[[CHILD PROMPT — frozen for snapshot]]');
        expect(relocated).toContain('## Specialization');
        expect(relocated).toContain(`\`<${AGENT_SPECIALIZATION_TAG}>\``);
        expect(relocated).toContain('immediately before the runtime state');
    });

    it('the relocation flag is ignored under default placement', () => {
        const def = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS });
        const flagged = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS }, { _SPECIALIZATION_RELOCATED: true });
        // Under default placement the stub still swaps in (the flag is orthogonal to placement)…
        expect(flagged).not.toContain('[[CHILD PROMPT — frozen for snapshot]]');
        // …but the volatile blocks stay and no pointer appears.
        expect(flagged).toContain('## Current Date/Time');
        expect(flagged).not.toContain('## Runtime State');
        expect(def).toContain('[[CHILD PROMPT — frozen for snapshot]]');
    });

    it('the pointer is omitted when no block would be sent (all three flags off, nothing relocated)', () => {
        const none = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS, volatileStatePlacement: 'trailingMessage', includeDateTimeInPrompt: false, includeScratchpadDocs: false, includePayloadInPrompt: false });
        expect(none).not.toContain('## Runtime State');
        expect(none).not.toContain('## Current Date/Time');
        // …but relocating the specialization alone is enough to bring the pointer back.
        const specOnly = renderSystemPrompt({ ...DEFAULT_LOOP_AGENT_PROMPT_PARAMS, volatileStatePlacement: 'trailingMessage', includeDateTimeInPrompt: false, includeScratchpadDocs: false, includePayloadInPrompt: false }, { _SPECIALIZATION_RELOCATED: true });
        expect(specOnly).toContain('## Runtime State');
    });

    it('the tag literals in the template match the code constants', () => {
        const template = readFileSync(TEMPLATE_PATH, 'utf8');
        expect(template).toContain(`<${RUNTIME_STATE_TAG}>`);
        expect(template).toContain(`<${AGENT_SPECIALIZATION_TAG}>`);
    });
});
