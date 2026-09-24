/**
 * Round-trip coverage for the prompt-persistence path in AgentSpecSync.
 *
 * `savePrompts` writes `promptEntity.TemplateText = promptSpec.PromptText` unconditionally,
 * so a spec's prompt text is persisted exactly as given. This test saves an agent whose
 * prompt is longer than any display-truncation limit and asserts the full text is written
 * back verbatim — never a truncated '...' prefix — so a caller that supplies a complete spec
 * never has its prompt templates silently shortened on save.
 *
 * A dedicated mock is used (not the shared one in agent-spec-sync.test.ts) because it must
 * supply `Metadata.Provider` and `RunView.FromMetadataProvider`, and capture every
 * TemplateText assignment.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { templateTextWrites, mockGetEntityObject, mockRunView, mockRunViews } = vi.hoisted(() => {
    const templateTextWrites: string[] = [];
    const makeEntity = () => {
        let templateText: string | undefined;
        const entity: Record<string, unknown> = {
            Load: vi.fn().mockResolvedValue(true),
            Save: vi.fn().mockResolvedValue(true),
            Delete: vi.fn().mockResolvedValue(true),
            NewRecord: vi.fn(),
            Validate: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
            ID: 'saved-id-1',
        };
        // Record every TemplateText write so the test can assert the full prompt round-trips.
        Object.defineProperty(entity, 'TemplateText', {
            get: () => templateText,
            set: (v: string) => { templateText = v; templateTextWrites.push(v); },
            configurable: true,
            enumerable: true,
        });
        return entity;
    };
    const empty = { Success: true, Results: [], RowCount: 0 };
    return {
        templateTextWrites,
        mockGetEntityObject: vi.fn(() => Promise.resolve(makeEntity())),
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

describe('AgentSpecSync prompt round-trip', () => {
    const mockUser = { ID: 'user-1', Email: 'test@test.com' } as never;

    beforeEach(() => {
        vi.clearAllMocks();
        templateTextWrites.length = 0;
    });

    it('persists an agent prompt with its FULL TemplateText — no truncation on save', async () => {
        const fullPrompt = 'Y'.repeat(300); // far beyond the loader action's 100-char display cap
        const sync = new AgentSpecSync(
            {
                ID: 'agent-1',
                Name: 'Round Trip Agent',
                Prompts: [{ PromptText: fullPrompt, PromptRole: 'System', PromptPosition: 'First' }],
            },
            mockUser
        );

        const result = await sync.SaveToDatabase();

        expect(result.success).toBe(true);
        // savePrompts must persist the prompt text exactly as supplied.
        expect(templateTextWrites).toContain(fullPrompt);
        // And nothing written was a truncated '...' prefix.
        expect(templateTextWrites.some(t => t.endsWith('...'))).toBe(false);
    });
});
