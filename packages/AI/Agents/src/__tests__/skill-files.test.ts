/**
 * Multi-file skills — the "read skill file" step. Against the REAL BaseAgent (as
 * skill-expose-to-model-agent.test.ts does): activating a skill that has `MJ: AI Skill Files` adds the
 * `Read Skill File` action to the activating agent's run and lists the paths (never the content);
 * a skill without files changes nothing. `RunView.prototype.RunView` is spied for the file listing and
 * the action engine is partially mocked so the action can be present or absent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, type UserInfo } from '@memberjunction/core';
import type { ExecuteAgentParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAISkillEntity } from '@memberjunction/core-entities';

const actions = vi.hoisted(() => ({ list: [] as Array<{ ID: string; Name: string; Status: string }> }));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: {} } }));
vi.mock('@memberjunction/actions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/actions')>()),
    ActionEngineServer: { Instance: { get Actions() { return actions.list; } } },
}));

import { BaseAgent } from '../base-agent';
import { FormatSkillFileListing, READ_SKILL_FILE_ACTION_NAME, type SkillFileRef } from '../skill-files';

const AGENT = { ID: '11111111-0000-4000-8000-000000000001', Name: 'Agent' } as unknown as MJAIAgentEntityExtended;
const DIAGRAMS = { ID: 'aaaaaaaa-0000-4000-8000-000000000001', Name: 'Diagrams' } as unknown as MJAISkillEntity;
const PLAIN = { ID: 'aaaaaaaa-0000-4000-8000-000000000002', Name: 'Plain' } as unknown as MJAISkillEntity;
const READ_ACTION = { ID: 'bbbbbbbb-0000-4000-8000-000000000001', Name: READ_SKILL_FILE_ACTION_NAME, Status: 'Active' };

interface Internals { enableSkillFiles(skills: MJAISkillEntity[], params: ExecuteAgentParams): Promise<string> }

describe('FormatSkillFileListing', () => {
    it('lists each skill\'s paths under its name and names the action', () => {
        const files: SkillFileRef[] = [
            { SkillID: DIAGRAMS.ID.toUpperCase(), Path: 'references/layout.md' },
            { SkillID: DIAGRAMS.ID, Path: 'schemas/workflow.json' },
        ];
        const text = FormatSkillFileListing([DIAGRAMS, PLAIN], files);
        expect(text).toContain('### Files of skill "Diagrams"\n- references/layout.md\n- schemas/workflow.json');
        expect(text).toContain(`"${READ_SKILL_FILE_ACTION_NAME}"`);
        expect(text).not.toContain('Plain');
    });

    it('is empty when no skill has files', () => {
        expect(FormatSkillFileListing([PLAIN], [])).toBe('');
    });
});

describe('BaseAgent.enableSkillFiles (real BaseAgent)', () => {
    let files: SkillFileRef[];
    let runViewSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        files = [];
        actions.list = [READ_ACTION];
        runViewSpy = vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async () => ({ Success: true, Results: files }) as never);
    });
    afterEach(() => runViewSpy.mockRestore());

    async function activate(skills: MJAISkillEntity[]): Promise<{ text: string; params: ExecuteAgentParams }> {
        const params = { agent: AGENT, contextUser: {} as UserInfo } as unknown as ExecuteAgentParams;
        const text = await (new BaseAgent() as unknown as Internals).enableSkillFiles(skills, params);
        return { text, params };
    }

    it('adds Read Skill File for the activating agent and lists the paths — reading paths only', async () => {
        files = [{ SkillID: DIAGRAMS.ID, Path: 'references/layout.md' }];
        const { text, params } = await activate([DIAGRAMS]);

        expect(params.actionChanges).toEqual([{ scope: 'specific', mode: 'add', actionIds: [READ_ACTION.ID], agentIds: [AGENT.ID] }]);
        expect(text).toContain('- references/layout.md');
        const view = runViewSpy.mock.calls[0][0] as { EntityName: string; Fields: string[]; ExtraFilter: string };
        expect(view.EntityName).toBe('MJ: AI Skill Files');
        expect(view.Fields).toEqual(['SkillID', 'Path']);
        expect(view.ExtraFilter).toContain(DIAGRAMS.ID);
    });

    it('a skill without files changes nothing', async () => {
        const { text, params } = await activate([PLAIN]);
        expect(text).toBe('');
        expect(params.actionChanges).toBeUndefined();
    });

    it('fails soft when the action is missing: no listing, no tool change', async () => {
        files = [{ SkillID: DIAGRAMS.ID, Path: 'references/layout.md' }];
        actions.list = [];
        const { text, params } = await activate([DIAGRAMS]);
        expect(text).toBe('');
        expect(params.actionChanges).toBeUndefined();
    });
});
