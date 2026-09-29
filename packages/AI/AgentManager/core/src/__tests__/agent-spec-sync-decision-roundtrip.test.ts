/**
 * Round-trip coverage for Decision steps in AgentSpecSync.
 *
 * Verifies that a Decision step's PromptID (whether custom or omitted) and Configuration
 * (whether supplied as JSON string or parsed object) survive save and load round trips.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { capturedStepEntities, mockGetEntityObject, mockRunView, mockRunViews } = vi.hoisted(() => {
    const capturedStepEntities: Record<string, unknown>[] = [];

    const makeEntity = (entityName: string) => {
        const entity: Record<string, unknown> = {
            Load: vi.fn().mockResolvedValue(true),
            Save: vi.fn().mockResolvedValue(true),
            Delete: vi.fn().mockResolvedValue(true),
            NewRecord: vi.fn(),
            Validate: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
            ID: 'saved-id-1',
            Name: 'Test Agent',
            TypeID: '4F6A189B-C068-4736-9F23-3FF540B40FDD',
            Status: 'Active',
            StartingPayloadValidationMode: 'Fail',
        };

        if (entityName === 'MJ: AI Agent Steps') {
            capturedStepEntities.push(entity);
        }

        return entity;
    };

    const empty = { Success: true, Results: [], RowCount: 0 };
    return {
        capturedStepEntities,
        mockGetEntityObject: vi.fn((name: string) => Promise.resolve(makeEntity(name))),
        mockRunView: vi.fn(() => Promise.resolve(empty)),
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

import { AgentSpecSync } from '../agent-spec-sync';

describe('AgentSpecSync Decision step round-trip', () => {
    const mockUser = { ID: 'user-1', Email: 'test@test.com' } as never;

    beforeEach(() => {
        vi.clearAllMocks();
        capturedStepEntities.length = 0;
    });

    it('persists a Decision step with custom PromptID and object Configuration', async () => {
        const decisionConfig = {
            key: 'triage',
            questions: {
                category: {
                    instructions: 'What category?',
                    kind: 'Choice',
                    options: [
                        { value: 'billing', description: 'Billing' },
                        { value: 'tech', description: 'Technical' },
                    ],
                },
            },
        };

        const sync = new AgentSpecSync(
            {
                ID: 'agent-1',
                Name: 'Decision Flow Agent',
                TypeID: '4F6A189B-C068-4736-9F23-3FF540B40FDD',
                Steps: [
                    {
                        ID: 'step-1',
                        Name: 'Triage Issue',
                        StepType: 'Decision',
                        StartingStep: true,
                        PromptID: 'custom-prompt-uuid-999',
                        Configuration: decisionConfig as unknown as string,
                    },
                ],
            },
            mockUser
        );

        const result = await sync.SaveToDatabase();
        expect(result.success).toBe(true);

        const savedStep = capturedStepEntities.find(s => s.Name === 'Triage Issue');
        expect(savedStep).toBeDefined();
        expect(savedStep?.StepType).toBe('Decision');
        expect(savedStep?.PromptID).toBe('custom-prompt-uuid-999');
        expect(savedStep?.Configuration).toBe(JSON.stringify(decisionConfig));
    });

    it('persists a Decision step with null PromptID when none is provided', async () => {
        const sync = new AgentSpecSync(
            {
                ID: 'agent-2',
                Name: 'Decision Agent Without Prompt',
                TypeID: '4F6A189B-C068-4736-9F23-3FF540B40FDD',
                Steps: [
                    {
                        ID: 'step-2',
                        Name: 'Default Decision Step',
                        StepType: 'Decision',
                        StartingStep: true,
                        Configuration: JSON.stringify({ key: 'route', questions: {} }),
                    },
                ],
            },
            mockUser
        );

        const result = await sync.SaveToDatabase();
        expect(result.success).toBe(true);

        const savedStep = capturedStepEntities.find(s => s.Name === 'Default Decision Step');
        expect(savedStep).toBeDefined();
        expect(savedStep?.PromptID).toBeNull();
        expect(savedStep?.Configuration).toBe(JSON.stringify({ key: 'route', questions: {} }));
    });

    it('loads a Decision step from database preserving PromptID and Configuration', async () => {
        const decisionConfigJson = JSON.stringify({
            key: 'triage',
            questions: {
                priority: {
                    text: 'What priority?',
                    kind: 'Rating',
                    minRating: 1,
                    maxRating: 5,
                },
            },
        });

        const mockAgentEntity = {
            Load: vi.fn().mockResolvedValue(true),
            ID: 'agent-3',
            Name: 'Loaded Decision Agent',
            TypeID: '4F6A189B-C068-4736-9F23-3FF540B40FDD',
            Status: 'Active',
            StartingPayloadValidationMode: 'Fail',
        };

        const mockStepEntity = {
            ID: 'step-3',
            AgentID: 'agent-3',
            Name: 'Rate Priority',
            StepType: 'Decision',
            StartingStep: true,
            PromptID: 'decision-prompt-777',
            Configuration: decisionConfigJson,
            Status: 'Active',
        };

        mockGetEntityObject.mockImplementation((name: string) => {
            if (name === 'MJ: AI Agents') {
                return Promise.resolve(mockAgentEntity);
            }
            return Promise.resolve({
                Load: vi.fn().mockResolvedValue(true),
                Save: vi.fn().mockResolvedValue(true),
                Validate: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
            });
        });

        // Set up RunViews return: [actions, childAgents, relatedAgents, prompts, steps]
        const empty = { Success: true, Results: [], RowCount: 0 };
        const stepsResult = { Success: true, Results: [mockStepEntity], RowCount: 1 };
        mockRunViews.mockResolvedValueOnce([empty, empty, empty, empty, stepsResult]);
        // mockRunView for paths
        mockRunView.mockResolvedValueOnce(empty);

        const loadedSync = await AgentSpecSync.LoadFromDatabase('agent-3', mockUser);

        expect(loadedSync.Spec.Steps).toBeDefined();
        expect(loadedSync.Spec.Steps).toHaveLength(1);

        const loadedStep = loadedSync.Spec.Steps![0];
        expect(loadedStep.Name).toBe('Rate Priority');
        expect(loadedStep.StepType).toBe('Decision');
        expect(loadedStep.PromptID).toBe('decision-prompt-777');
        expect(loadedStep.Configuration).toBe(decisionConfigJson);
    });
});
