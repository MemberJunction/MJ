/**
 * Unit tests for AI Skill Discovery & Progressive-Disclosure Actions:
 *   - FindCandidateSkillsAction (`Find Candidate Skills`)
 *   - FindBestSkillAction (`Find Best Skill`)
 *   - GetSkillDetailsAction (`Get Skill Details`)
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { Metadata } from '@memberjunction/core';
import type { MJAISkillEntity } from '@memberjunction/core-entities';
import type { RunActionParams } from '@memberjunction/actions-base';
import { FindCandidateSkillsAction } from '../custom/ai/find-candidate-skills.action.ts';
import { FindBestSkillAction } from '../custom/ai/find-best-skill.action.ts';
import { GetSkillDetailsAction } from '../custom/ai/get-skill-details.action.ts';

interface MockSkill {
    ID: string;
    Name: string;
    Description: string;
    Category: string;
    Status: 'Active' | 'Deprecated' | 'Pending';
    ActivationMode: 'Auto' | 'RequestedOnly';
    ActivationScope: 'Conversation' | 'Run';
    SearchScopeAccess: 'All' | 'Assigned' | 'None' | null;
    Instructions: string;
}

const SKILLS_FIXTURE: MockSkill[] = [
    {
        ID: '11111111-1111-4111-8111-000000000001',
        Name: 'GitHub Engineering & Repository Steward',
        Description: 'Inspect GitHub repositories, read source files, diagnose CI workflows, and open atomic pull requests.',
        Category: 'Engineering',
        Status: 'Active',
        ActivationMode: 'Auto',
        ActivationScope: 'Run',
        SearchScopeAccess: 'None',
        Instructions: '# GitHub Steward Instructions\nAlways start with GitHub - Get Repository Context.',
    },
    {
        ID: '11111111-1111-4111-8111-000000000002',
        Name: 'SQL Query Performance Tuning',
        Description: 'Analyze SQL execution plans, index fragmentation, and query bottlenecks in SQL Server.',
        Category: 'Database',
        Status: 'Active',
        ActivationMode: 'Auto',
        ActivationScope: 'Run',
        SearchScopeAccess: 'Assigned',
        Instructions: '# SQL Tuning Instructions\nInspect index usage stats first.',
    },
    {
        ID: '11111111-1111-4111-8111-000000000003',
        Name: 'Executive Board Deck Composer',
        Description: 'Draft quarterly board presentations and financial summary slides.',
        Category: 'Executive',
        Status: 'Active',
        ActivationMode: 'RequestedOnly',
        ActivationScope: 'Conversation',
        SearchScopeAccess: 'None',
        Instructions: '# Board Deck Instructions\nUse concise executive bullets.',
    },
];

const ACTIONS_FIXTURE = [
    {
        ID: '22222222-2222-4222-8222-000000000001',
        Name: 'GitHub - Get Repository Context',
        Description: 'Fetches repo metadata, README, and top-level tree in 1 call.',
    },
    {
        ID: '22222222-2222-4222-8222-000000000002',
        Name: 'GitHub - Commit Files and Create PR',
        Description: 'Creates a branch, commits files atomically, and opens a pull request.',
    },
    {
        ID: '22222222-2222-4222-8222-000000000003',
        Name: 'Run Adhoc Query',
        Description: 'Executes a read-only SQL query.',
    },
];

const AGENTS_FIXTURE = [
    {
        ID: '33333333-3333-4333-8333-000000000001',
        Name: 'Codesmith Agent',
        Description: 'Generates TypeScript and JavaScript code.',
    },
    {
        ID: '33333333-3333-4333-8333-000000000002',
        Name: 'Research Agent',
        Description: 'Multi-domain research orchestrator.',
    },
];

function configureEngineFixtures(options?: { vectorHits?: Array<{ ID: string; Score: number }> }): void {
    const aiEngine = AIEngine.Instance as unknown as Record<string, unknown>;
    aiEngine.Config = async () => {};
    Object.defineProperty(aiEngine, 'Skills', {
        get: () => SKILLS_FIXTURE as unknown as MJAISkillEntity[],
        configurable: true,
    });
    Object.defineProperty(aiEngine, 'Agents', {
        get: () => AGENTS_FIXTURE,
        configurable: true,
    });
    aiEngine.GetSkillExposedActionIDs = (skillId: string): string[] => {
        if (skillId.endsWith('0001')) {
            return [ACTIONS_FIXTURE[0].ID, ACTIONS_FIXTURE[1].ID];
        }
        if (skillId.endsWith('0002')) {
            return [ACTIONS_FIXTURE[2].ID];
        }
        return [];
    };
    aiEngine.GetSkillActionIDs = (skillId: string): string[] => {
        if (skillId.endsWith('0001')) {
            return [ACTIONS_FIXTURE[0].ID, ACTIONS_FIXTURE[1].ID];
        }
        if (skillId.endsWith('0002')) {
            return [ACTIONS_FIXTURE[2].ID];
        }
        return [];
    };
    aiEngine.GetSkillSubAgentIDs = (skillId: string): string[] => {
        if (skillId.endsWith('0001')) {
            return [AGENTS_FIXTURE[0].ID];
        }
        return [];
    };
    aiEngine.GetAutoActivatableSkillsForAgent = () =>
        SKILLS_FIXTURE.filter((s) => s.ActivationMode === 'Auto') as unknown as MJAISkillEntity[];
    aiEngine.GetSkillsForAgent = () => SKILLS_FIXTURE as unknown as MJAISkillEntity[];

    const actionEngine = ActionEngineServer.Instance as unknown as Record<string, unknown>;
    actionEngine.Config = async () => {};
    Object.defineProperty(actionEngine, 'Actions', {
        get: () => ACTIONS_FIXTURE,
        configurable: true,
    });

    Object.defineProperty(Metadata, 'Provider', {
        get: () => ({
            SearchEntity: async () => {
                if (!options?.vectorHits) {
                    throw new Error('Vector index not configured in test environment');
                }
                return options.vectorHits.map((h) => ({
                    recordId: h.ID,
                    score: h.Score,
                }));
            },
        }),
        configurable: true,
    });
}

function makeParams(inputs: Record<string, unknown>): RunActionParams {
    return {
        Params: Object.entries(inputs).map(([Name, Value]) => ({
            Name,
            Type: 'Input' as const,
            Value,
        })),
        ContextUser: { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' } as unknown as RunActionParams['ContextUser'],
    } as unknown as RunActionParams;
}

describe('FindCandidateSkillsAction & FindBestSkillAction', () => {
    beforeEach(() => {
        configureEngineFixtures();
    });

    it('rejects missing or blank TaskDescription', async () => {
        const action = new FindCandidateSkillsAction();
        const res = await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<{ Success: boolean; ResultCode: string }> }).InternalRunAction(
            makeParams({ TaskDescription: '   ' }),
        );
        assert.equal(res.Success, false);
        assert.equal(res.ResultCode, 'MISSING_TASK_DESCRIPTION');
    });

    it('uses hybrid vector hits when Provider.SearchEntity returns matches and hydrates ActionNames & SubAgentNames', async () => {
        configureEngineFixtures({
            vectorHits: [
                { ID: SKILLS_FIXTURE[0].ID, Score: 0.92 },
                { ID: SKILLS_FIXTURE[1].ID, Score: 0.48 },
            ],
        });

        const action = new FindCandidateSkillsAction();
        const params = makeParams({
            TaskDescription: 'Open a pull request and commit files to a GitHub repository',
            MaxResults: 5,
            MinimumSimilarityScore: 0.4,
        });
        const res = await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<{ Success: boolean; Message: string }> }).InternalRunAction(params);

        assert.equal(res.Success, true);
        const body = JSON.parse(res.Message);
        assert.equal(body.searchMethod, 'hybrid-vector');
        assert.equal(body.matchCount, 2);
        assert.equal(body.matchedSkills[0].Name, 'GitHub Engineering & Repository Steward');
        assert.deepEqual(body.matchedSkills[0].ActionNames, [
            'GitHub - Get Repository Context',
            'GitHub - Commit Files and Create PR',
        ]);
        assert.deepEqual(body.matchedSkills[0].SubAgentNames, ['Codesmith Agent']);
    });

    it('falls back to lexical skill ranking when vector search is unavailable and filters by Category and AgentID', async () => {
        const action = new FindCandidateSkillsAction();
        const params = makeParams({
            TaskDescription: 'Inspect GitHub repository files and open a pull request',
            Category: 'Engineering',
            AgentID: AGENTS_FIXTURE[1].ID,
        });
        const res = await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<{ Success: boolean; Message: string }> }).InternalRunAction(params);

        assert.equal(res.Success, true);
        const body = JSON.parse(res.Message);
        assert.equal(body.searchMethod, 'lexical-fallback');
        assert.equal(body.matchCount, 1);
        assert.equal(body.matchedSkills[0].Name, 'GitHub Engineering & Repository Steward');
        assert.ok(body.matchedSkills[0].SimilarityScore >= 0.6);
    });

    it('FindBestSkillAction populates BestSkill output parameter with the highest-scoring skill', async () => {
        const action = new FindBestSkillAction();
        const params = makeParams({
            TaskDescription: 'Tune SQL Server query execution plans and indexes',
        });
        const res = await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<{ Success: boolean; Message: string }> }).InternalRunAction(params);

        assert.equal(res.Success, true);
        const bestSkillParam = params.Params.find((p) => p.Name === 'BestSkill');
        assert.ok(bestSkillParam);
        const best = bestSkillParam.Value as { Name: string; ActionNames: string[] };
        assert.equal(best.Name, 'SQL Query Performance Tuning');
        assert.deepEqual(best.ActionNames, ['Run Adhoc Query']);
    });
});

describe('GetSkillDetailsAction', () => {
    beforeEach(() => {
        configureEngineFixtures();
    });

    it('returns full skill metadata, bundled actions, bundled sub-agents, and instructions by SkillName', async () => {
        const action = new GetSkillDetailsAction();
        const params = makeParams({
            SkillName: 'GitHub Engineering & Repository Steward',
            IncludeInstructions: true,
        });
        const res = await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<{ Success: boolean; Message: string }> }).InternalRunAction(params);

        assert.equal(res.Success, true);
        const details = JSON.parse(res.Message);
        assert.equal(details.ID, SKILLS_FIXTURE[0].ID);
        assert.equal(details.Category, 'Engineering');
        assert.equal(details.BundledActions.length, 2);
        assert.equal(details.BundledActions[0].Name, 'GitHub - Get Repository Context');
        assert.equal(details.BundledActions[0].ExposeAsTool, true);
        assert.equal(details.BundledSubAgents.length, 1);
        assert.equal(details.BundledSubAgents[0].Name, 'Codesmith Agent');
        assert.ok(details.Instructions.includes('Always start with GitHub - Get Repository Context'));
    });

    it('omits Instructions when IncludeInstructions is false and returns SKILL_NOT_FOUND for unknown skill', async () => {
        const action = new GetSkillDetailsAction();
        const noInstructionsParams = makeParams({
            SkillID: SKILLS_FIXTURE[1].ID,
            IncludeInstructions: 'false',
        });
        const res1 = await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<{ Success: boolean; Message: string }> }).InternalRunAction(
            noInstructionsParams,
        );
        assert.equal(res1.Success, true);
        const details = JSON.parse(res1.Message);
        assert.equal(details.Instructions, undefined);

        const missingParams = makeParams({ SkillName: 'Nonexistent Quantum Skill' });
        const res2 = await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<{ Success: boolean; ResultCode: string }> }).InternalRunAction(
            missingParams,
        );
        assert.equal(res2.Success, false);
        assert.equal(res2.ResultCode, 'SKILL_NOT_FOUND');
    });
});
