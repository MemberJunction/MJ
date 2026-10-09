/**
 * What a task-graph Prompt step's template receives.
 *
 * The runner used to hand templates `_CURRENT_PAYLOAD` (and `flowContext`) as JSON TEXT. Under the
 * dispatcher, which is how a top-level Flow run executes by default, `{{ _CURRENT_PAYLOAD.assessment }}`
 * therefore rendered empty — a string has no `.assessment` — and `{{ _CURRENT_PAYLOAD | dump }}`
 * double-encoded. A draft step was asked to write from an empty assessment, and did.
 *
 * These render the runner's template data through the real template engine (the same nunjucks
 * environment, autoescape and custom filters prompt rendering uses), so they pin what an author sees,
 * not just the data's shape.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

const captured = vi.hoisted(() => ({ data: undefined as Record<string, unknown> | undefined }));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn(async () => undefined),
            Prompts: [{ ID: 'PROMPT-1', Name: 'Draft the note' }],
        },
    },
}));

vi.mock('@memberjunction/ai-prompts', () => ({
    AIPromptRunner: class {
        async ExecutePrompt(params: { data?: Record<string, unknown> }) {
            captured.data = params.data;
            return { success: true, result: '{"draft":"ok"}', promptRun: { ID: 'PR-1' } };
        }
    },
}));

import { TemplateEngineServer } from '@memberjunction/templates';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { TaskPromptRunParams } from '@memberjunction/task-graph';
import { TaskGraphPromptRunner } from '../services/TaskGraphPromptRunner';

const PAYLOAD = {
    assessment: { verdict: 'Strong fit', score: 8 },
    candidate: 'Ada',
};

function runParams(overrides: Partial<TaskPromptRunParams> = {}): TaskPromptRunParams {
    const provider: Partial<IMetadataProvider> = {};
    const user: Partial<UserInfo> = {};
    return {
        TaskID: 'T-1',
        PromptID: 'PROMPT-1',
        InputPayload: PAYLOAD,
        DependencyOutputs: new Map<string, unknown>([['T-0', { research: ['a', 'b'] }]]),
        Provider: provider as IMetadataProvider,
        ContextUser: user as UserInfo,
        ...overrides,
    };
}

/** Runs the prompt node and returns the template data the prompt runner was given. */
async function templateData(overrides: Partial<TaskPromptRunParams> = {}): Promise<Record<string, unknown>> {
    captured.data = undefined;
    const result = await new TaskGraphPromptRunner().RunPromptForTask(runParams(overrides));
    expect(result.Success).toBe(true);
    if (!captured.data) throw new Error('The prompt runner was never given template data.');
    return captured.data;
}

/** Renders `template` against `data` the way prompt templates are rendered: autoescape on, MJ's filters. */
async function render(template: string, data: Record<string, unknown>): Promise<string> {
    const rendered = await TemplateEngineServer.Instance.RenderTemplateSimple(template, data);
    if (!rendered.Success) throw new Error(rendered.Message ?? 'render failed');
    return rendered.Output ?? '';
}

describe('TaskGraphPromptRunner template data', () => {
    beforeAll(() => {
        TemplateEngineServer.Instance.SetupNunjucks();
    });

    it('hands the template _CURRENT_PAYLOAD as an object, not as JSON text', async () => {
        const data = await templateData();

        expect(typeof data._CURRENT_PAYLOAD).toBe('object');
        expect(data._CURRENT_PAYLOAD).toEqual(PAYLOAD);
    });

    it('renders a payload field reached by dot access', async () => {
        const data = await templateData();

        expect(await render('{{ _CURRENT_PAYLOAD.candidate }} / {{ _CURRENT_PAYLOAD.assessment.verdict }}', data))
            .toBe('Ada / Strong fit');
    });

    it('renders | dump single-encoded', async () => {
        const data = await templateData();

        expect(await render('{{ _CURRENT_PAYLOAD | dump | safe }}', data)).toBe(JSON.stringify(PAYLOAD));
    });

    it('still renders the whole payload as JSON when written bare, as the workflow demo prompts do', async () => {
        const data = await templateData();

        expect(String(data._CURRENT_PAYLOAD)).toBe(JSON.stringify(PAYLOAD, null, 2));
        // Bare, under autoescape: byte-for-byte what the pre-serialized string used to produce.
        expect(await render('{{ _CURRENT_PAYLOAD }}', data))
            .toBe(await render('{{ text }}', { text: JSON.stringify(PAYLOAD, null, 2) }));
    });

    it('keeps the documented jsonparse workaround working', async () => {
        const data = await templateData();

        expect(await render('{{ (_CURRENT_PAYLOAD | jsonparse).assessment.verdict }}', data)).toBe('Strong fit');
        expect(await render('{{ _CURRENT_PAYLOAD | jsonparse | json | safe }}', data)).toBe(JSON.stringify(PAYLOAD, null, 2));
    });

    it('makes flowContext readable by field too', async () => {
        const data = await templateData();

        expect(await render('{{ flowContext.dependencyOutputs["T-0"].research | join(",") }}', data)).toBe('a,b');
    });

    it('makes an object template parameter (a loop item) readable by field and printable whole', async () => {
        const data = await templateData({ TemplateParameters: { lead: { name: 'Acme', score: 9 }, i: 0, tone: 'brief' } });

        expect(await render('{{ lead.name }} #{{ i }} ({{ tone }})', data)).toBe('Acme #0 (brief)');
        expect(String(data.lead)).toBe(JSON.stringify({ name: 'Acme', score: 9 }, null, 2));
    });
});
