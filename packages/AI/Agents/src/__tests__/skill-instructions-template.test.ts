/**
 * Templated skill instructions (base-agent.ts `resolveSkillInstructions`) — against the REAL BaseAgent
 * and the REAL TemplateEngineServer renderer. Only the engine's database-backed `Config()` is replaced,
 * by `SetupNunjucks()`, so templates render through real Nunjucks with the same autoescaping prompts get.
 * The AIEngine singleton is module-mocked and the activation side effects are stubbed, as in
 * skill-availability-hook.test.ts.
 *
 * Contract pinned:
 *   1. instructions starting with the `{# mj:template #}` marker render with params.data, the payload
 *      (`_CURRENT_PAYLOAD`) and the agent's name/description, on both activation paths;
 *   2. unmarked instructions are used verbatim — including literal `{{query:"…"}}` — and never touch
 *      the template engine;
 *   3. a render error falls back to the stored text, logs a warning, and does not fail the activation;
 *   4. interpolated values are HTML-escaped, as in agent prompts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentConfiguration, BaseAgentNextStep, ExecuteAgentParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAISkillEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import { TemplateEngineServer } from '@memberjunction/templates';

const engine = vi.hoisted(() => ({ skills: [] as unknown[] }));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            get Skills(): unknown[] { return engine.skills; },
            GetSkillsForAgent: (): unknown[] => engine.skills,
            GetAutoActivatableSkillsForAgent: (): unknown[] => engine.skills,
        },
    },
}));

const logs = vi.hoisted(() => ({ errorEx: [] as Array<{ message: string; severity?: string }> }));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogErrorEx: (options: { message: string; severity?: string } | string) => {
            logs.errorEx.push(typeof options === 'string' ? { message: options } : options);
        },
    };
});

import { BaseAgent } from '../base-agent';
import { IsTemplatedSkillInstructions, SKILL_INSTRUCTIONS_TEMPLATE_MARKER } from '../skill-instructions-template';

const AGENT = {
    ID: '11111111-0000-4000-8000-000000000001', Name: 'Orchestrator', Description: 'Runs the show',
    AcceptsSkills: 'All', SkillActivationMode: 'Auto',
} as unknown as MJAIAgentEntityExtended;

function skill(id: string, name: string, instructions: string): MJAISkillEntity {
    return { ID: id, Name: name, Instructions: instructions, Status: 'Active', ActivationMode: 'Auto', ActivationScope: 'Run' } as unknown as MJAISkillEntity;
}

const TEMPLATED = skill('aaaaaaaa-0000-4000-8000-000000000001', 'Designer',
    `${SKILL_INSTRUCTIONS_TEMPLATE_MARKER}\nAgent {{ agentName }} ({{ agentDescription }}).\n` +
    `Brand: {{ brandColor }}.\n{% for e in entities %}- {{ e }}\n{% endfor %}` +
    `{% if _CURRENT_PAYLOAD.phase == "design" %}DESIGN PHASE{% else %}OTHER PHASE{% endif %}`);
const QUERY_LITERAL = skill('bbbbbbbb-0000-4000-8000-000000000002', 'Data Analysis',
    'Compose with `{{query:"Sales/Monthly Revenue"}}` as the base CTE.');
const BROKEN = skill('cccccccc-0000-4000-8000-000000000003', 'Broken',
    `${SKILL_INSTRUCTIONS_TEMPLATE_MARKER}\n{% if brandColor %}never closed`);
const ESCAPING = skill('dddddddd-0000-4000-8000-000000000004', 'Escaping',
    `${SKILL_INSTRUCTIONS_TEMPLATE_MARKER}Company: {{ company }}`);

interface Internals {
    _depth: number;
    recordSkillActivationStep: () => Promise<void>;
    enableSkillCapabilities: () => void;
    executePromptStep: () => Promise<BaseAgentNextStep>;
    preActivateRequestedSkills(params: ExecuteAgentParams): Promise<void>;
    executeSkillStep(params: ExecuteAgentParams, config: AgentConfiguration, previous: BaseAgentNextStep): Promise<BaseAgentNextStep>;
}

function bare(): Internals {
    const i = new BaseAgent() as unknown as Internals;
    i._depth = 0;
    i.recordSkillActivationStep = async () => undefined;
    i.enableSkillCapabilities = () => undefined;
    i.executePromptStep = async () => ({ step: 'Success', terminate: true } as BaseAgentNextStep);
    return i;
}

function paramsFor(requested: MJAISkillEntity[], payload: Record<string, string> = { phase: 'design' }): ExecuteAgentParams {
    return {
        agent: AGENT, contextUser: {} as UserInfo, conversationMessages: [], payload,
        requestedSkillIDs: requested.map(s => s.ID),
        data: { brandColor: '#0055ff', entities: ['Accounts', 'Invoices'], company: 'Smith & <Sons>' },
    } as unknown as ExecuteAgentParams;
}

function activationMessage(params: ExecuteAgentParams): string {
    const msg = (params.conversationMessages ?? []).find(
        m => (m as { metadata?: { messageType?: string } }).metadata?.messageType === 'skill-activation');
    return String(msg?.content ?? '');
}

describe('templated skill instructions (real BaseAgent + real renderer)', () => {
    let configSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        logs.errorEx = [];
        configSpy = vi.spyOn(TemplateEngineServer.Instance, 'Config')
            .mockImplementation(async () => { TemplateEngineServer.Instance.SetupNunjucks(); });
    });
    afterEach(() => { configSpy.mockRestore(); });

    it('renders a marked skill with params.data, the payload and the agent fields (requested path)', async () => {
        engine.skills = [TEMPLATED];
        const params = paramsFor([TEMPLATED]);
        await bare().preActivateRequestedSkills(params);

        const message = activationMessage(params);
        expect(message).toContain('## Skill Activated: Designer\n\nAgent Orchestrator (Runs the show).');
        expect(message).toContain('Brand: #0055ff.');
        expect(message).toContain('- Accounts\n- Invoices');
        expect(message).toContain('DESIGN PHASE');
        expect(message).not.toContain('mj:template');
        expect(message).not.toContain('{%');
    });

    it('renders with the decision\'s new payload on the model-initiated Skill step', async () => {
        engine.skills = [TEMPLATED];
        const params = paramsFor([], { phase: 'design' });
        const previous = {
            step: 'Skill', skillActivations: [{ name: 'Designer' }],
            newPayload: { phase: 'review' }, previousPayload: { phase: 'design' },
        } as unknown as BaseAgentNextStep;
        await bare().executeSkillStep(params, {} as AgentConfiguration, previous);

        const message = activationMessage(params);
        expect(message).toContain('OTHER PHASE');
        expect(message).not.toContain('DESIGN PHASE');
    });

    it('uses unmarked instructions verbatim, literal {{query:…}} included, without configuring the engine', async () => {
        engine.skills = [QUERY_LITERAL];
        const params = paramsFor([QUERY_LITERAL]);
        await bare().preActivateRequestedSkills(params);

        expect(activationMessage(params)).toContain('Compose with `{{query:"Sales/Monthly Revenue"}}` as the base CTE.');
        expect(configSpy).not.toHaveBeenCalled();
        expect(logs.errorEx).toHaveLength(0);
    });

    it('falls back to the stored text and logs a warning when the template fails to render', async () => {
        engine.skills = [BROKEN, TEMPLATED];
        const params = paramsFor([BROKEN, TEMPLATED]);
        await bare().preActivateRequestedSkills(params);

        const message = activationMessage(params);
        expect(message).toContain(BROKEN.Instructions);
        expect(message).toContain('Brand: #0055ff.'); // the other skill in the same activation still renders
        const warnings = logs.errorEx.filter(l => l.message.includes("Skill 'Broken'"));
        expect(warnings).toHaveLength(1);
        expect(warnings[0].severity).toBe('warning');
    });

    it('HTML-escapes interpolated values, as agent prompts do', async () => {
        engine.skills = [ESCAPING];
        const params = paramsFor([ESCAPING]);
        await bare().preActivateRequestedSkills(params);

        expect(activationMessage(params)).toContain('Company: Smith &amp; &lt;Sons&gt;');
    });
});

describe('IsTemplatedSkillInstructions', () => {
    it('is true only when the text starts with the marker (leading whitespace ignored)', () => {
        expect(IsTemplatedSkillInstructions(`${SKILL_INSTRUCTIONS_TEMPLATE_MARKER}\nhello`)).toBe(true);
        expect(IsTemplatedSkillInstructions(`\n  ${SKILL_INSTRUCTIONS_TEMPLATE_MARKER} hello`)).toBe(true);
        expect(IsTemplatedSkillInstructions(`hello ${SKILL_INSTRUCTIONS_TEMPLATE_MARKER}`)).toBe(false);
        expect(IsTemplatedSkillInstructions('{{ agentName }}')).toBe(false);
        expect(IsTemplatedSkillInstructions(null)).toBe(false);
        expect(IsTemplatedSkillInstructions(undefined)).toBe(false);
    });
});
