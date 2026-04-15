import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep } from '@memberjunction/ai-core-plus';

// ─── Hoisted mocks (referenced inside vi.mock factories) ────────────────────
// vi.mock() is hoisted to file top; variables used in factories must use vi.hoisted()

const { mockCreateEntity, mockModifyEntity } = vi.hoisted(() => ({
    mockCreateEntity: vi.fn(),
    mockModifyEntity: vi.fn(),
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
    EntityDesignerPipelineExecutor: {
        CreateEntity: mockCreateEntity,
        ModifyEntity: mockModifyEntity,
    },
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { EntityDesignerSchemaBuilder } from '../agents/entity-schema-builder.js';
import type { EntityDesignerPayload } from '../interfaces.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

type TestableBuilder = {
    executeAgentInternal<P>(
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }>;
};

function makeBuilder(): TestableBuilder {
    return new EntityDesignerSchemaBuilder() as unknown as TestableBuilder;
}

function makeParams(payload: EntityDesignerPayload): ExecuteAgentParams {
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

const VALID_PAYLOAD: EntityDesignerPayload = {
    ValidationResult: { Valid: true, Errors: [], Warnings: [] },
    SchemaDesign: { TableDefinition: VALID_TABLE_DEFINITION, ModificationType: 'create' },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EntityDesignerSchemaBuilder', () => {
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
                    SchemaDesign: { TableDefinition: VALID_TABLE_DEFINITION },
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
                    SchemaDesign: {},
                }),
                {} as AgentConfiguration
            );
            expect(result.finalStep.step).toBe('Failed');
            expect(result.finalStep.reasoning).toContain('TableDefinition');
        });
    });

    describe('executeAgentInternal — happy path (create mode)', () => {
        beforeEach(() => {
            mockCreateEntity.mockResolvedValue({
                Success: true,
                EntityName: 'Project Milestones',
                EntityID: 'ent-123',
                SchemaName: '__mj_UDT',
                TableName: 'ProjectMilestones',
                PipelineSteps: [{ Name: 'RunMigration', Status: 'success', DurationMs: 200 }],
            });
        });

        it('returns Success with EntityDesignerResult populated', async () => {
            const builder = makeBuilder();
            const result = await builder.executeAgentInternal(
                makeParams(VALID_PAYLOAD),
                {} as AgentConfiguration
            );

            expect(result.finalStep.step).toBe('Success');
            const payload = result.finalStep.newPayload as EntityDesignerPayload;
            expect(payload.EntityDesignerResult?.Success).toBe(true);
            expect(payload.EntityDesignerResult?.EntityName).toBe('Project Milestones');
            expect(payload.EntityDesignerResult?.EntityID).toBe('ent-123');
        });

        it('calls CreateEntity with the TableDefinition', async () => {
            const builder = makeBuilder();
            await builder.executeAgentInternal(makeParams(VALID_PAYLOAD), {} as AgentConfiguration);

            expect(mockCreateEntity).toHaveBeenCalledWith(
                VALID_TABLE_DEFINITION,
                expect.anything(),
                // SkipRestart must be true — the builder runs inside a live MJAPI request
                // and a full server restart would kill the in-flight agent run.
                // Metadata.Refresh() handles entity registration without a restart.
                expect.objectContaining({ SkipGitCommit: false, SkipRestart: true })
            );
        });

        it('tags Source as EntityDesigner when FunctionalRequirements is present', async () => {
            const builder = makeBuilder();
            const payloadWithRequirements: EntityDesignerPayload = {
                ...VALID_PAYLOAD,
                FunctionalRequirements: 'I want to track milestones',
            };
            await builder.executeAgentInternal(makeParams(payloadWithRequirements), {} as AgentConfiguration);

            expect(mockCreateEntity).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.objectContaining({ Source: 'EntityDesigner' })
            );
        });

        it('tags Source as AgentManager when no FunctionalRequirements', async () => {
            const builder = makeBuilder();
            await builder.executeAgentInternal(makeParams(VALID_PAYLOAD), {} as AgentConfiguration);

            expect(mockCreateEntity).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.objectContaining({ Source: 'AgentManager' })
            );
        });
    });

    describe('executeAgentInternal — failure from pipeline', () => {
        it('returns Failed when pipeline fails', async () => {
            mockCreateEntity.mockResolvedValue({
                Success: false,
                ErrorMessage: 'SQL execution error: duplicate table',
            });

            const builder = makeBuilder();
            const result = await builder.executeAgentInternal(makeParams(VALID_PAYLOAD), {} as AgentConfiguration);

            expect(result.finalStep.step).toBe('Failed');
            expect(result.finalStep.reasoning).toContain('SQL execution error');
        });

        it('writes EntityDesignerResult to payload even on failure', async () => {
            mockCreateEntity.mockResolvedValue({
                Success: false,
                ErrorMessage: 'Failed',
                PipelineSteps: [],
            });

            const builder = makeBuilder();
            const result = await builder.executeAgentInternal(makeParams(VALID_PAYLOAD), {} as AgentConfiguration);

            const payload = result.finalStep.newPayload as EntityDesignerPayload;
            expect(payload?.EntityDesignerResult).toBeDefined();
            expect(payload?.EntityDesignerResult?.Success).toBe(false);
        });
    });
});
