/**
 * What a Flow agent's Prompt step template receives when the flow runs IN-RUN (`executionMode: 'inRun'`,
 * which `mj ai agents run` asks for). The task-graph dispatcher's half of the same contract is pinned by
 * MJServer's TaskGraphPromptRunner.templateData.test.ts — a workflow's templates must render the same
 * under either mode.
 *
 * In-run, `_CURRENT_PAYLOAD` was a bare object: field access worked, but `{{ _CURRENT_PAYLOAD }}` — the
 * form the shipped workflow-demo prompts use — printed `[object Object]`. Under the dispatcher it was
 * JSON text, so field access rendered empty instead. These render through the real template engine.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { TemplateEngineServer } from '@memberjunction/templates';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { FlowAgentType, FlowExecutionState } from '../agent-types/flow-agent-type';

const PAYLOAD = {
    assessment: { verdict: 'Strong fit', score: 8, strengths: ['clear', 'concise'] },
    candidate: 'Ada',
};

/** Builds the prompt params a Flow Prompt step renders with, as `BaseAgent.preparePromptParams` does. */
async function injected(payload: Record<string, unknown> | null, state?: FlowExecutionState): Promise<Record<string, unknown>> {
    const prompt = new AIPromptParams();
    await new FlowAgentType().InjectPayload(payload, state, prompt, { agentId: 'agent-1', agentRunId: state ? 'run-1' : undefined });
    if (!prompt.data) throw new Error('InjectPayload left the prompt with no template data.');
    return prompt.data;
}

/** Renders the way prompt templates are rendered: autoescape on, MJ's custom filters. */
async function render(template: string, data: Record<string, unknown>): Promise<string> {
    const rendered = await TemplateEngineServer.Instance.RenderTemplateSimple(template, data);
    if (!rendered.Success) throw new Error(rendered.Message ?? 'render failed');
    return rendered.Output ?? '';
}

describe('FlowAgentType.InjectPayload: the payload a Prompt step template reads', () => {
    beforeAll(() => {
        TemplateEngineServer.Instance.SetupNunjucks();
    });

    it('renders payload fields reached by dot access', async () => {
        const data = await injected(PAYLOAD);

        expect(await render('{{ _CURRENT_PAYLOAD.candidate }}: {{ _CURRENT_PAYLOAD.assessment.verdict }}', data))
            .toBe('Ada: Strong fit');
    });

    it('renders the whole payload as JSON when written bare, not [object Object]', async () => {
        const data = await injected(PAYLOAD);

        const rendered = await render('{{ _CURRENT_PAYLOAD }}', data);

        expect(rendered).not.toContain('[object Object]');
        expect(rendered).toBe(await render('{{ text }}', { text: JSON.stringify(PAYLOAD, null, 2) }));
    });

    it('renders a nested object written bare as JSON too', async () => {
        const data = await injected(PAYLOAD);

        expect(await render('{{ _CURRENT_PAYLOAD.assessment }}', data))
            .toBe(await render('{{ text }}', { text: JSON.stringify(PAYLOAD.assessment, null, 2) }));
    });

    it('renders | dump single-encoded, as the Flow system prompt uses it', async () => {
        const data = await injected(PAYLOAD);

        expect(await render('{{ _CURRENT_PAYLOAD | dump | safe }}', data)).toBe(JSON.stringify(PAYLOAD));
    });

    it('keeps the jsonparse workaround working on an object', async () => {
        const data = await injected(PAYLOAD);

        expect(await render('{% set p = _CURRENT_PAYLOAD | jsonparse %}{{ p.assessment.strengths | join(", ") }}', data))
            .toBe('clear, concise');
    });

    it('treats a missing payload as an empty object', async () => {
        const data = await injected(null);

        expect(await render('{{ _CURRENT_PAYLOAD | dump | safe }}', data)).toBe('{}');
    });

    it('does not hand the template the live payload, so rendering can never change it', async () => {
        const payload = { draft: { text: 'v1' } };
        const data = await injected(payload);

        expect(data._CURRENT_PAYLOAD).toEqual(payload);
        expect(data._CURRENT_PAYLOAD).not.toBe(payload);
    });

    it('makes flowContext readable by field and printable whole', async () => {
        const state = new FlowExecutionState('agent-1');
        state.currentStepId = 'step-2';
        state.completedStepIds.add('step-1');
        state.executionPath.push('step-1', 'step-2');

        const data = await injected(PAYLOAD, state);

        expect(await render('{{ flowContext.currentStepId }} after {{ flowContext.executionPath | join(" → ") }}', data))
            .toBe('step-2 after step-1 → step-2');
        expect(await render('{{ flowContext }}', data)).not.toContain('[object Object]');
    });
});
