/**
 * Coverage for how AgentSpecSync links a Flow step to what it runs when the spec leaves the ID empty
 * (#4914):
 *  - a Sub-Agent step, or a loop whose body is a sub-agent, links by its Name to the spec's own
 *    sub-agent or to an active agent, and refuses the save on zero or several matches;
 *  - a loop whose body is a prompt written inline as PromptText gets an AIPrompt created and linked.
 *
 * A dedicated mock (not the shared one in agent-spec-sync.test.ts) is used because a save needs
 * `Metadata.Provider` and `RunView.FromMetadataProvider`, distinct IDs per created record, and a
 * scripted agent lookup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface CapturedEntity {
    EntityName: string;
    ID: string;
    [field: string]: unknown;
}

interface AgentLookupResult {
    Success: boolean;
    Results: { ID: string }[];
    RowCount: number;
}

const { captured, mockGetEntityObject, mockRunView, mockRunViews, agentLookup } = vi.hoisted(() => {
    const captured: CapturedEntity[] = [];
    let counter = 0;
    const agentLookup: { rows: { ID: string }[]; filters: string[] } = { rows: [], filters: [] };

    const makeEntity = (entityName: string): CapturedEntity => {
        counter++;
        const entity: CapturedEntity = {
            EntityName: entityName,
            ID: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
            Load: vi.fn().mockResolvedValue(true),
            Save: vi.fn().mockResolvedValue(true),
            Delete: vi.fn().mockResolvedValue(true),
            NewRecord: vi.fn(),
            Validate: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
        };
        captured.push(entity);
        return entity;
    };

    const empty = { Success: true, Results: [], RowCount: 0 };
    return {
        captured,
        agentLookup,
        mockGetEntityObject: vi.fn((name: string) => Promise.resolve(makeEntity(name))),
        mockRunView: vi.fn((params: { EntityName: string; ExtraFilter?: string }): Promise<AgentLookupResult> => {
            if (params.EntityName === 'MJ: AI Agents') {
                agentLookup.filters.push(params.ExtraFilter ?? '');
                return Promise.resolve({ Success: true, Results: agentLookup.rows, RowCount: agentLookup.rows.length });
            }
            return Promise.resolve(empty);
        }),
        mockRunViews: vi.fn(() => Promise.resolve([empty, empty, empty, empty, empty])),
    };
});

vi.mock('@memberjunction/core', () => {
    const rvInstance = { RunView: mockRunView, RunViews: mockRunViews };
    return {
        Metadata: Object.assign(
            vi.fn().mockImplementation(() => ({ GetEntityObject: mockGetEntityObject })),
            { Provider: { GetEntityObject: mockGetEntityObject } }
        ),
        RunView: Object.assign(
            vi.fn().mockImplementation(() => rvInstance),
            { FromMetadataProvider: vi.fn(() => rvInstance) }
        ),
        UserInfo: vi.fn(),
        LogError: vi.fn(),
    };
});

vi.mock('@memberjunction/core-entities', () => ({
    MJAIAgentEntity: vi.fn(),
    MJAIAgentActionEntity: vi.fn(),
    MJAIAgentRelationshipEntity: vi.fn(),
    MJAIAgentStepEntity: vi.fn(),
    MJAIAgentStepPathEntity: vi.fn(),
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    AgentSpec: vi.fn(),
    AgentActionSpec: vi.fn(),
    SubAgentSpec: vi.fn(),
}));

import { UserInfo } from '@memberjunction/core';
import type { AgentSpec, AgentStep, SubAgentSpec } from '@memberjunction/ai-core-plus';
import { AgentSpecSync } from '../agent-spec-sync';

const FLOW_TYPE_ID = '4F6A189B-C068-4736-9F23-3FF540B40FDD';
const EXISTING_AGENT_ID = 'A1B2C3D4-0000-4000-8000-000000000001';
const OTHER_AGENT_ID = 'A1B2C3D4-0000-4000-8000-000000000002';

const forEachConfig = { itemVariable: 'item', collectionPath: 'payload.items' };

function flowSpec(steps: AgentStep[], subAgents: SubAgentSpec[] = []): Partial<AgentSpec> {
    return {
        ID: '',
        Name: 'Ticket Flow',
        TypeID: FLOW_TYPE_ID,
        Steps: steps,
        Paths: [],
        SubAgents: subAgents,
    };
}

function relatedSubAgent(id: string, name: string): SubAgentSpec {
    return { Type: 'related', SubAgent: { ID: id, Name: name } as AgentSpec } as SubAgentSpec;
}

function childSubAgent(name: string): SubAgentSpec {
    return { Type: 'child', SubAgent: { ID: '', Name: name, Steps: [], SubAgents: [] } as AgentSpec } as SubAgentSpec;
}

function savedStep(name: string): CapturedEntity | undefined {
    return captured.find(e => e.EntityName === 'MJ: AI Agent Steps' && e.Name === name);
}

describe('AgentSpecSync step links', () => {
    // UserInfo is mocked above, so this is the mock's instance.
    const mockUser = new UserInfo();

    beforeEach(() => {
        vi.clearAllMocks();
        captured.length = 0;
        agentLookup.rows = [];
        agentLookup.filters = [];
    });

    describe('Sub-Agent steps with an empty SubAgentID', () => {
        it("links to the spec's related sub-agent of the same name", async () => {
            const sync = new AgentSpecSync(
                flowSpec(
                    [{ ID: '', Name: 'Ticket Analyzer', StepType: 'Sub-Agent', StartingStep: true, SubAgentID: '' }],
                    [relatedSubAgent(EXISTING_AGENT_ID, 'Ticket Analyzer')]
                ),
                mockUser
            );

            const result = await sync.SaveToDatabase();

            expect(result.success).toBe(true);
            expect(savedStep('Ticket Analyzer')?.SubAgentID).toBe(EXISTING_AGENT_ID);
            // The spec match wins; the database is not searched.
            expect(agentLookup.filters).toEqual([]);
        });

        it('links to a child sub-agent the same save creates', async () => {
            const sync = new AgentSpecSync(
                flowSpec(
                    [{ ID: '', Name: 'ticket analyzer ', StepType: 'Sub-Agent', StartingStep: true, SubAgentID: '' }],
                    [childSubAgent('Ticket Analyzer')]
                ),
                mockUser
            );

            const result = await sync.SaveToDatabase();

            expect(result.success).toBe(true);
            const childAgent = captured.find(e => e.EntityName === 'MJ: AI Agents' && e.Name === 'Ticket Analyzer');
            expect(childAgent).toBeDefined();
            expect(savedStep('ticket analyzer ')?.SubAgentID).toBe(childAgent?.ID);
            expect(sync.spec.Steps?.[0].SubAgentID).toBe(childAgent?.ID);
        });

        it('links to the one active agent of that name when the spec has none', async () => {
            agentLookup.rows = [{ ID: EXISTING_AGENT_ID }];
            const sync = new AgentSpecSync(
                flowSpec([{ ID: '', Name: "Rep's Helper", StepType: 'Sub-Agent', StartingStep: true }]),
                mockUser
            );

            const result = await sync.SaveToDatabase();

            expect(result.success).toBe(true);
            expect(savedStep("Rep's Helper")?.SubAgentID).toBe(EXISTING_AGENT_ID);
            expect(agentLookup.filters).toEqual(["Name='Rep''s Helper' AND Status='Active'"]);
        });

        it('keeps a SubAgentID the spec already sets', async () => {
            const sync = new AgentSpecSync(
                flowSpec([{ ID: '', Name: 'Ticket Analyzer', StepType: 'Sub-Agent', StartingStep: true, SubAgentID: OTHER_AGENT_ID }]),
                mockUser
            );

            const result = await sync.SaveToDatabase();

            expect(result.success).toBe(true);
            expect(savedStep('Ticket Analyzer')?.SubAgentID).toBe(OTHER_AGENT_ID);
            expect(agentLookup.filters).toEqual([]);
        });

        it('refuses the save, writing nothing, when no sub-agent has the name', async () => {
            const sync = new AgentSpecSync(
                flowSpec([{ ID: '', Name: 'Missing Agent', StepType: 'Sub-Agent', StartingStep: true, SubAgentID: '' }]),
                mockUser
            );

            const result = await sync.SaveToDatabase();

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('step "Missing Agent" has no SubAgentID');
            expect(captured).toEqual([]);
        });

        it('refuses the save when several active agents have the name', async () => {
            agentLookup.rows = [{ ID: EXISTING_AGENT_ID }, { ID: OTHER_AGENT_ID }];
            const sync = new AgentSpecSync(
                flowSpec([{ ID: '', Name: 'Analyzer', StepType: 'Sub-Agent', StartingStep: true }]),
                mockUser
            );

            const result = await sync.SaveToDatabase();

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('matches 2 active agents');
            expect(captured).toEqual([]);
        });

        it('counts one active agent once when IDs differ only in case', async () => {
            agentLookup.rows = [{ ID: EXISTING_AGENT_ID }, { ID: EXISTING_AGENT_ID.toLowerCase() }];
            const sync = new AgentSpecSync(
                flowSpec([{ ID: '', Name: 'Analyzer', StepType: 'Sub-Agent', StartingStep: true }]),
                mockUser
            );

            const result = await sync.SaveToDatabase();

            expect(result.success).toBe(true);
            expect(savedStep('Analyzer')?.SubAgentID).toBe(EXISTING_AGENT_ID);
        });

        it('refuses the save when several spec sub-agents have the name', async () => {
            const sync = new AgentSpecSync(
                flowSpec(
                    [{ ID: '', Name: 'Analyzer', StepType: 'Sub-Agent', StartingStep: true }],
                    [childSubAgent('Analyzer'), relatedSubAgent(OTHER_AGENT_ID, 'Analyzer')]
                ),
                mockUser
            );

            const result = await sync.SaveToDatabase();

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('matches 2 sub-agents in the spec');
            expect(captured).toEqual([]);
        });
    });

    describe('loop steps', () => {
        it('links a loop whose body is a sub-agent by its name', async () => {
            const sync = new AgentSpecSync(
                flowSpec(
                    [{
                        ID: '', Name: 'Item Worker', StepType: 'ForEach', StartingStep: true,
                        LoopBodyType: 'Sub-Agent', Configuration: forEachConfig,
                    }],
                    [relatedSubAgent(EXISTING_AGENT_ID, 'Item Worker')]
                ),
                mockUser
            );

            const result = await sync.SaveToDatabase();

            expect(result.success).toBe(true);
            expect(savedStep('Item Worker')?.SubAgentID).toBe(EXISTING_AGENT_ID);
        });

        it('creates and links the inline prompt of a loop whose body is a prompt', async () => {
            const sync = new AgentSpecSync(
                flowSpec([{
                    ID: '', Name: 'Summarize Items', StepType: 'ForEach', StartingStep: true,
                    LoopBodyType: 'Prompt', PromptID: '', PromptName: 'Item Summary',
                    PromptText: 'Summarize {{ item }}.', Configuration: forEachConfig,
                }]),
                mockUser
            );

            const result = await sync.SaveToDatabase();

            expect(result.success).toBe(true);
            const prompt = captured.find(e => e.EntityName === 'MJ: AI Prompts');
            expect(prompt?.Name).toBe('Item Summary');
            expect(prompt?.TemplateText).toBe('Summarize {{ item }}.');
            expect(savedStep('Summarize Items')?.PromptID).toBe(prompt?.ID);
            expect(result.mutations.some(m => m.Entity === 'MJ: AI Prompts' && m.Operation === 'Create')).toBe(true);
        });

        it('creates no prompt for a loop whose body is an action', async () => {
            const sync = new AgentSpecSync(
                flowSpec([{
                    ID: '', Name: 'Send Each', StepType: 'ForEach', StartingStep: true,
                    LoopBodyType: 'Action', ActionID: OTHER_AGENT_ID,
                    PromptText: 'ignored', Configuration: forEachConfig,
                }]),
                mockUser
            );

            const result = await sync.SaveToDatabase();

            expect(result.success).toBe(true);
            expect(captured.some(e => e.EntityName === 'MJ: AI Prompts')).toBe(false);
            expect(savedStep('Send Each')?.PromptID).toBeNull();
        });
    });
});
