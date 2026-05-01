import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep } from '@memberjunction/ai-core-plus';

// ─── Hoisted mocks (referenced inside vi.mock factories) ────────────────────
// vi.mock() is hoisted to file top; variables used in factories must use vi.hoisted()

const { mockCreateEntitiesBatch } = vi.hoisted(() => ({
    mockCreateEntitiesBatch: vi.fn(),
}));

// ─── Mock all external dependencies ─────────────────────────────────────────

vi.mock('@memberjunction/core', () => ({
    Metadata: vi.fn().mockImplementation(function(this: unknown) {
        return { Refresh: vi.fn(), Entities: [] };
    }),
    RunView: vi.fn().mockImplementation(function(this: unknown) {
        return {
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
        };
    }),
    LogError: vi.fn(),
    UserInfo: vi.fn(),
}));

vi.mock('@memberjunction/ai-agents', () => ({
    BaseAgent: class BaseAgent {
        protected async executeAgentInternal(): Promise<unknown> {
            return {};
        }
    },
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (_target: unknown) => _target,
}));

vi.mock('../pipeline-executor.js', () => ({
    DatabaseDesignerPipelineExecutor: {
        CreateEntitiesBatch: mockCreateEntitiesBatch,
    },
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { DatabaseDesignerSchemaBuilder } from '../agents/database-schema-builder.js';
import type { DatabaseDesignerPayload } from '../interfaces.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

type TestableBuilder = {
    executeAgentInternal<P>(
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }>;
};

function makeBuilder(): TestableBuilder {
    return new DatabaseDesignerSchemaBuilder() as unknown as TestableBuilder;
}

function makeParams(payload: DatabaseDesignerPayload): ExecuteAgentParams {
    return {
        payload,
        contextUser: { ID: 'user-1' } as ReturnType<typeof vi.fn>,
    } as unknown as ExecuteAgentParams;
}

const VALID_TABLE_DEFINITION = {
    SchemaName: '__mj_UDT',
    TableName: 'ProjectMilestones',
    EntityName: 'Project Milestones',
    Columns: [{ Name: 'Title', Type: 'string' as const, IsNullable: false }],
};

/** Phase D: SchemaDesign uses Tables[] array, not single TableDefinition */
const VALID_PAYLOAD: DatabaseDesignerPayload = {
    ValidationResult: { Valid: true, Errors: [], Warnings: [] },
    SchemaDesign: {
        Tables: [{ TableDefinition: VALID_TABLE_DEFINITION, ModificationType: 'create' }],
    },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DatabaseDesignerSchemaBuilder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('executeAgentInternal — pre-condition guards', () => {
        it('returns Failed when ValidationResult is missing', async () => {
            const builder = makeBuilder();
            const result = await builder.executeAgentInternal(
                makeParams({}),
                {} as AgentConfiguration
            );
            expect(result.finalStep.step).toBe('Failed');
            expect(result.finalStep.reasoning).toContain('ValidationResult');
        });

        it('returns Failed when ValidationResult.Valid is false', async () => {
            const builder = makeBuilder();
            const result = await builder.executeAgentInternal(
                makeParams({
                    ValidationResult: { Valid: false, Errors: ['column conflict'], Warnings: [] },
                    SchemaDesign: {
                        Tables: [{ TableDefinition: VALID_TABLE_DEFINITION, ModificationType: 'create' }],
                    },
                }),
                {} as AgentConfiguration
            );
            expect(result.finalStep.step).toBe('Failed');
            expect(result.finalStep.reasoning).toContain('column conflict');
        });

        it('returns Failed when TableDefinition is missing', async () => {
            const builder = makeBuilder();
            const result = await builder.executeAgentInternal(
                makeParams({
                    ValidationResult: { Valid: true, Errors: [], Warnings: [] },
                    SchemaDesign: { Tables: [] }, // empty Tables[]
                }),
                {} as AgentConfiguration
            );
            expect(result.finalStep.step).toBe('Failed');
            // Message should mention Tables[] or missing
            expect(result.finalStep.reasoning).toMatch(/Tables|missing/i);
        });
    });

    describe('executeAgentInternal — happy path (create mode)', () => {
        beforeEach(() => {
            mockCreateEntitiesBatch.mockResolvedValue({
                Success: true,
                Results: [{
                    Success: true,
                    EntityName: 'Project Milestones',
                    EntityID: 'ent-123',
                    SchemaName: '__mj_UDT',
                    TableName: 'ProjectMilestones',
                    PipelineSteps: [{ Name: 'RunMigration', Status: 'success', DurationMs: 200 }],
                }],
            });
        });

        it('returns Success with DatabaseDesignerResult populated', async () => {
            const builder = makeBuilder();
            const result = await builder.executeAgentInternal(
                makeParams(VALID_PAYLOAD),
                {} as AgentConfiguration
            );

            expect(result.finalStep.step).toBe('Success');
            const payload = result.finalStep.newPayload as DatabaseDesignerPayload;
            expect(payload.DatabaseDesignerResult?.Success).toBe(true);
            expect(payload.DatabaseDesignerResult?.Results[0]?.EntityName).toBe('Project Milestones');
            expect(payload.DatabaseDesignerResult?.Results[0]?.EntityID).toBe('ent-123');
        });

        it('calls CreateEntitiesBatch with the TableDefinition', async () => {
            const builder = makeBuilder();
            await builder.executeAgentInternal(makeParams(VALID_PAYLOAD), {} as AgentConfiguration);

            expect(mockCreateEntitiesBatch).toHaveBeenCalledWith(
                [expect.objectContaining({ tableDefinition: VALID_TABLE_DEFINITION })],
                expect.anything(),
                // SkipRestart must be true — the builder runs inside a live MJAPI request
                // and a full server restart would kill the in-flight agent run.
                expect.objectContaining({ SkipGitCommit: false, SkipRestart: true })
            );
        });

        it('tags Source as DatabaseDesigner when FunctionalRequirements is present', async () => {
            const builder = makeBuilder();
            const payloadWithRequirements: DatabaseDesignerPayload = {
                ...VALID_PAYLOAD,
                FunctionalRequirements: 'I want to track milestones',
            };
            await builder.executeAgentInternal(makeParams(payloadWithRequirements), {} as AgentConfiguration);

            expect(mockCreateEntitiesBatch).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.objectContaining({ Source: 'DatabaseDesigner' })
            );
        });

        it('tags Source as AgentManager when no FunctionalRequirements', async () => {
            const builder = makeBuilder();
            await builder.executeAgentInternal(makeParams(VALID_PAYLOAD), {} as AgentConfiguration);

            expect(mockCreateEntitiesBatch).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.objectContaining({ Source: 'AgentManager' })
            );
        });
    });

    describe('executeAgentInternal — failure from pipeline', () => {
        it('returns Failed when pipeline fails', async () => {
            mockCreateEntitiesBatch.mockResolvedValue({
                Success: false,
                Results: [{
                    Success: false,
                    ErrorMessage: 'SQL execution error: duplicate table',
                }],
            });

            const builder = makeBuilder();
            const result = await builder.executeAgentInternal(makeParams(VALID_PAYLOAD), {} as AgentConfiguration);

            expect(result.finalStep.step).toBe('Failed');
            expect(result.finalStep.reasoning).toContain('SQL execution error');
        });

        it('writes DatabaseDesignerResult to payload even on failure', async () => {
            mockCreateEntitiesBatch.mockResolvedValue({
                Success: false,
                Results: [{
                    Success: false,
                    ErrorMessage: 'Failed',
                    PipelineSteps: [],
                }],
            });

            const builder = makeBuilder();
            const result = await builder.executeAgentInternal(makeParams(VALID_PAYLOAD), {} as AgentConfiguration);

            const payload = result.finalStep.newPayload as DatabaseDesignerPayload;
            expect(payload?.DatabaseDesignerResult).toBeDefined();
            expect(payload?.DatabaseDesignerResult?.Success).toBe(false);
        });
    });
});
