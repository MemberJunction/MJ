import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep } from '@memberjunction/ai-core-plus';

// ─── Hoisted mock state ──────────────────────────────────────────────────────
// Mutable state shared between the vi.mock factory and per-test overrides.
// Must be created with vi.hoisted() so it exists before mock factories run.

const mockState = vi.hoisted(() => ({
    authorizations: [] as { Name: string; UserCanExecute: (u: unknown) => boolean }[],
    runViewResults: [] as unknown[],
}));

// ─── Mock all external dependencies ─────────────────────────────────────────

vi.mock('@memberjunction/core', () => ({
    Metadata: vi.fn().mockImplementation(function(this: unknown) {
        return { Authorizations: mockState.authorizations };
    }),
    RunView: vi.fn().mockImplementation(function(this: unknown) {
        return {
            RunView: vi.fn().mockResolvedValue({
                Success: true,
                Results: mockState.runViewResults,
                RowCount: mockState.runViewResults.length,
            }),
        };
    }),
    UserInfo: vi.fn(),
}));

vi.mock('@memberjunction/schema-engine', () => ({
    SchemaValidator: {
        Validate: vi.fn().mockReturnValue({ Valid: true, Errors: [], Warnings: [] }),
    },
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
    LogError: vi.fn(),
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { EntityDesignerSchemaValidator } from '../agents/entity-schema-validator.js';
import type { EntityDesignerPayload } from '../interfaces.js';
import { ENTITY_DESIGNER_BLOCKED_SCHEMAS, AUTHORIZATIONS } from '../interfaces.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

/** Expose protected method for testing. */
type TestableValidator = {
    executeAgentInternal<P>(
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }>;
};

function makeValidator(): TestableValidator {
    return new EntityDesignerSchemaValidator() as unknown as TestableValidator;
}

function makeParams(payload: EntityDesignerPayload): ExecuteAgentParams {
    return {
        payload,
        contextUser: { ID: 'user-1', Email: 'test@example.com' } as ReturnType<typeof vi.fn>,
    } as unknown as ExecuteAgentParams;
}

const VALID_TABLE_DEFINITION = {
    SchemaName: '__mj_UDT',
    TableName: 'ProjectMilestones',
    EntityName: 'Project Milestones',
    Description: 'Milestones for projects',
    Columns: [
        { Name: 'Title', Type: 'string' as const, IsNullable: false },
        { Name: 'DueDate', Type: 'datetime' as const, IsNullable: true },
    ],
};

const AUTH_WITH_EXECUTE = {
    Name: AUTHORIZATIONS.CREATE_IN_UDT_SCHEMA,
    UserCanExecute: () => true,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EntityDesignerSchemaValidator', () => {
    beforeEach(() => {
        // Reset shared mock state before each test
        mockState.authorizations = [];
        mockState.runViewResults = [];
    });

    describe('executeAgentInternal', () => {
        it('returns Failed when TableDefinition is absent from payload', async () => {
            const validator = makeValidator();
            const result = await validator.executeAgentInternal(makeParams({}), {} as AgentConfiguration);
            expect(result.finalStep.step).toBe('Failed');
        });

        it('returns Failed when SchemaDesign section is missing', async () => {
            const validator = makeValidator();
            const result = await validator.executeAgentInternal(
                makeParams({ FunctionalRequirements: 'build a table' }),
                {} as AgentConfiguration
            );
            expect(result.finalStep.step).toBe('Failed');
        });

        it('returns Failed when authorization record is not configured', async () => {
            // mockState.authorizations stays [] → auth record not found
            const validator = makeValidator();
            const result = await validator.executeAgentInternal(
                makeParams({ SchemaDesign: { TableDefinition: VALID_TABLE_DEFINITION, ModificationType: 'create' } }),
                {} as AgentConfiguration
            );
            expect(result.finalStep.step).toBe('Failed');
            expect(result.finalStep.reasoning).toContain('Authorization');
        });

        it('returns Success with ValidationResult.Valid=false when schema is blocked', async () => {
            // 'dbo' schema resolves to CREATE_IN_CUSTOM_SCHEMA auth (not UDT)
            mockState.authorizations = [{
                Name: AUTHORIZATIONS.CREATE_IN_CUSTOM_SCHEMA,
                UserCanExecute: () => true,
            }];

            const validator = makeValidator();
            const blockedDef = { ...VALID_TABLE_DEFINITION, SchemaName: 'dbo' };
            const result = await validator.executeAgentInternal(
                makeParams({ SchemaDesign: { TableDefinition: blockedDef, ModificationType: 'create' } }),
                {} as AgentConfiguration
            );

            expect(result.finalStep.step).toBe('Success');
            const payload = result.finalStep.newPayload as EntityDesignerPayload;
            expect(payload.ValidationResult?.Valid).toBe(false);
            expect(payload.ValidationResult?.Errors[0]).toContain('dbo');
        });

        it('returns Success with ValidationResult.Valid=false when reserved column is present', async () => {
            mockState.authorizations = [AUTH_WITH_EXECUTE];

            const validator = makeValidator();
            const reservedColDef = {
                ...VALID_TABLE_DEFINITION,
                Columns: [
                    { Name: 'ID', Type: 'uuid' as const, IsNullable: false }, // reserved!
                    { Name: 'Title', Type: 'string' as const, IsNullable: false },
                ],
            };
            const result = await validator.executeAgentInternal(
                makeParams({ SchemaDesign: { TableDefinition: reservedColDef, ModificationType: 'create' } }),
                {} as AgentConfiguration
            );

            expect(result.finalStep.step).toBe('Success');
            const payload = result.finalStep.newPayload as EntityDesignerPayload;
            expect(payload.ValidationResult?.Valid).toBe(false);
            expect(payload.ValidationResult?.Errors.some(e => e.includes("'ID'"))).toBe(true);
        });

        it('returns Success with ValidationResult.Valid=true when definition is valid', async () => {
            mockState.authorizations = [AUTH_WITH_EXECUTE];

            const validator = makeValidator();
            const result = await validator.executeAgentInternal(
                makeParams({ SchemaDesign: { TableDefinition: VALID_TABLE_DEFINITION, ModificationType: 'create' } }),
                {} as AgentConfiguration
            );

            expect(result.finalStep.step).toBe('Success');
            const payload = result.finalStep.newPayload as EntityDesignerPayload;
            expect(payload.ValidationResult?.Valid).toBe(true);
            expect(payload.ValidationResult?.Errors).toHaveLength(0);
        });

        it('reports a naming conflict from RunView result', async () => {
            mockState.authorizations = [AUTH_WITH_EXECUTE];
            mockState.runViewResults = [{ ID: 'existing-id' }]; // entity already exists

            const validator = makeValidator();
            const result = await validator.executeAgentInternal(
                makeParams({ SchemaDesign: { TableDefinition: VALID_TABLE_DEFINITION, ModificationType: 'create' } }),
                {} as AgentConfiguration
            );

            const payload = result.finalStep.newPayload as EntityDesignerPayload;
            expect(payload.ValidationResult?.Valid).toBe(false);
            expect(payload.ValidationResult?.Errors.some(e => e.includes('already exists'))).toBe(true);
        });
    });

    describe('ENTITY_DESIGNER_BLOCKED_SCHEMAS constant', () => {
        it('blocks __mj, dbo, sys, and information_schema', () => {
            expect(ENTITY_DESIGNER_BLOCKED_SCHEMAS.has('__mj')).toBe(true);
            expect(ENTITY_DESIGNER_BLOCKED_SCHEMAS.has('dbo')).toBe(true);
            expect(ENTITY_DESIGNER_BLOCKED_SCHEMAS.has('sys')).toBe(true);
            expect(ENTITY_DESIGNER_BLOCKED_SCHEMAS.has('information_schema')).toBe(true);
        });

        it('does not block __mj_UDT', () => {
            expect(ENTITY_DESIGNER_BLOCKED_SCHEMAS.has('__mj_udt')).toBe(false);
            expect(ENTITY_DESIGNER_BLOCKED_SCHEMAS.has('__mj_UDT')).toBe(false);
        });
    });
});
