/**
 * BaseAgent.enableSkillCapabilities against the REAL BaseAgent (`new BaseAgent()` + casts, as
 * conversation-scoped-skills.test.ts does) — pins what an activated skill puts onto the run:
 *   1. only the skill's ExposeToModel rows become an ActionChange (GetSkillExposedActionIDs, not
 *      GetSkillActionIDs), targeting the activating agent;
 *   2. a skill whose every bundled action is code-only pushes NO ActionChange at all — the actions
 *      are out of the run, not merely out of the prompt;
 *   3. sub-agents are unaffected by the flag.
 * The engine singleton is module-mocked so the two lookups can disagree on purpose.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ExecuteAgentParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAISkillEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';

const engine = vi.hoisted(() => ({ all: [] as string[], exposed: [] as string[], subAgents: [] as string[] }));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            GetSkillActionIDs: (): string[] => engine.all,
            GetSkillExposedActionIDs: (): string[] => engine.exposed,
            GetSkillSubAgentIDs: (): string[] => engine.subAgents,
        },
    },
}));

import { BaseAgent } from '../base-agent';

const SKILL = { ID: 'aaaaaaaa-0000-4000-8000-000000000001', Name: 'Exam Creator', Instructions: 'x' } as unknown as MJAISkillEntity;
const AGENT = { ID: '11111111-0000-4000-8000-000000000001', Name: 'Test Agent' } as unknown as MJAIAgentEntityExtended;
const EXPOSED = 'bbbbbbbb-0000-4000-8000-00000000000a';
const CODE_ONLY = 'bbbbbbbb-0000-4000-8000-00000000000b';
const SUB = 'cccccccc-0000-4000-8000-00000000000c';

interface Internals { enableSkillCapabilities(skill: MJAISkillEntity, params: ExecuteAgentParams): void }

function run(): ExecuteAgentParams {
    const params = { agent: AGENT, contextUser: {} as UserInfo, conversationMessages: [] } as unknown as ExecuteAgentParams;
    (new BaseAgent() as unknown as Internals).enableSkillCapabilities(SKILL, params);
    return params;
}

describe('enableSkillCapabilities (real BaseAgent) honours AISkillAction.ExposeToModel', () => {
    it('pushes only the exposed subset as a specific-scoped ActionChange for the activating agent', () => {
        engine.all = [EXPOSED, CODE_ONLY]; engine.exposed = [EXPOSED]; engine.subAgents = [];
        const params = run();
        expect(params.actionChanges).toEqual([{ scope: 'specific', mode: 'add', actionIds: [EXPOSED], agentIds: [AGENT.ID] }]);
        expect(JSON.stringify(params.actionChanges)).not.toContain(CODE_ONLY);
    });

    it('pushes no ActionChange when every bundled action is code-only — the actions are out of the run', () => {
        engine.all = [CODE_ONLY]; engine.exposed = []; engine.subAgents = [];
        const params = run();
        expect(params.actionChanges ?? []).toEqual([]);
    });

    it('sub-agents are bundled regardless of the action flag', () => {
        engine.all = [CODE_ONLY]; engine.exposed = []; engine.subAgents = [SUB];
        const params = run();
        expect(params.actionChanges ?? []).toEqual([]);
        expect(params.subAgentChanges).toEqual([{ scope: 'specific', mode: 'add', subAgentIds: [SUB], agentIds: [AGENT.ID] }]);
    });
});
