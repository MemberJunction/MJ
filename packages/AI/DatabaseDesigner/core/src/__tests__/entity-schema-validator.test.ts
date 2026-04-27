import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep } from '@memberjunction/ai-core-plus';

// ─── Hoisted mock state ──────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
    authorizations: [] as { Name: string; UserCanExecute: (u: unknown) => boolean }[],
    /** Results for the naming-conflict RunView (MJ: Entities). */
    runViewResults: [] as unknown[],
    /** Results for the ownership RunView (MJ: Entity Settings). */
    settingsResults: [] as { Name: string; Value: string }[],
    /** Schemas returned by RuntimeSchemaManager.GetAllProtectedSchemas(). */
    protectedSchemas: new Set<string>(['__mj', 'dbo', 'sys', 'information_schema']),
}));

// ─── Mock all external dependencies ─────────────────────────────────────────

vi.mock('@memberjunction/core', () => ({
    Metadata: vi.fn().mockImplementation(function(this: unknown) {
        return { Authorizations: mockState.authorizations };
    }),
    RunView: vi.fn().mockImplementation(function(this: unknown) {
        return {
            RunView: vi.fn().mockImplementation(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Entity Settings') {
                    return {
                        Success: true,
                        Results: mockState.settingsResults,
                        RowCount: mockState.settingsResults.length,
                    };
                }
                // Naming conflict check (MJ: Entities)
                return {
                    Success: true,
                    Results: mockState.runViewResults,
                    RowCount: mockState.runViewResults.length,
                };
            }),
        };
    }),
    AuthorizationEvaluator: vi.fn().mockImplementation(function(this: unknown) {
        return {
            UserCanExecuteWithAncestors: vi.fn().mockImplementation(
                (auth: { UserCanExecute?: (u: unknown) => boolean }, user: unknown) =>
                    auth?.UserCanExecute?.(user) ?? false
            ),
        };
    }),
    LogError: vi.fn(),
    UserInfo: vi.fn(),
}));

vi.mock('@memberjunction/schema-engine', () => ({
    SchemaValidator: {
        Validate: vi.fn().mockReturnValue({ Valid: true, Errors: [], Warnings: [] }),
    },
    RuntimeSchemaManager: {
        Instance: {
            GetAllProtectedSchemas: vi.fn(() => mockState.protectedSchemas),
        },
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
    // UUIDsEqual normalises case — mirrors the real implementation
    UUIDsEqual: (a: string, b: string) => a.toLowerCase() === b.toLowerCase(),
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { DatabaseDesignerSchemaValidator } from '../agents/database-schema-validator.js';
import type { DatabaseDesignerPayload } from '../interfaces.js';
import { AUTHORIZATIONS, UDT_SETTINGS } from '../interfaces.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

type TestableValidator = {
    executeAgentInternal<P>(
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }>;
};

function makeValidator(): TestableValidator {
    return new DatabaseDesignerSchemaValidator() as unknown as TestableValidator;
}

function makeParams(payload: DatabaseDesignerPayload, userID = 'user-1'): ExecuteAgentParams {
    return {
        payload,
        contextUser: { ID: userID, Email: 'test@example.com' } as ReturnType<typeof vi.fn>,
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

const AUTH_CREATE_UDT = {
    Name: AUTHORIZATIONS.CREATE_IN_UDT_SCHEMA,
    UserCanExecute: () => true,
};

/** Phase D helper: wrap a single TableDefinition in the new Tables[] shape */
function makeCreatePayload(tableDef = VALID_TABLE_DEFINITION): DatabaseDesignerPayload {
    return {
        SchemaDesign: {
            Tables: [{ TableDefinition: tableDef, ModificationType: 'create' }],
        },
    };
}

function makeAlterPayload(tableDef = VALID_TABLE_DEFINITION, existingEntityID?: string): DatabaseDesignerPayload {
    return {
        SchemaDesign: {
            Tables: [{
                TableDefinition: tableDef,
                ModificationType: 'alter',
                ExistingEntityID: existingEntityID,
            }],
        },
    };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DatabaseDesignerSchemaValidator', () => {
    beforeEach(() => {
        mockState.authorizations = [];
        mockState.runViewResults = [];
        mockState.settingsResults = [];
        mockState.protectedSchemas = new Set(['__mj', 'dbo', 'sys', 'information_schema']);
    });

    describe('executeAgentInternal — pre-condition guards', () => {
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
                makeParams(makeCreatePayload()),
                {} as AgentConfiguration
            );
            expect(result.finalStep.step).toBe('Failed');
            expect(result.finalStep.reasoning).toContain('Authorization');
        });
    });

    describe('executeAgentInternal — schema blocklist (via RuntimeSchemaManager)', () => {
        it('blocks dbo schema when RSM includes it', async () => {
            // dbo is in the default mockState.protectedSchemas
            mockState.authorizations = [{ Name: AUTHORIZATIONS.CREATE_IN_CUSTOM_SCHEMA, UserCanExecute: () => true }];

            const validator = makeValidator();
            const blockedDef = { ...VALID_TABLE_DEFINITION, SchemaName: 'dbo' };
            const result = await validator.executeAgentInternal(
                makeParams(makeCreatePayload(blockedDef)),
                {} as AgentConfiguration
            );

            expect(result.finalStep.step).toBe('Success');
            const payload = result.finalStep.newPayload as DatabaseDesignerPayload;
            expect(payload.ValidationResult?.Valid).toBe(false);
            expect(payload.ValidationResult?.Errors[0]).toContain('dbo');
        });

        it('always blocks __mj schema — RSM returns it regardless of env-var config', async () => {
            mockState.authorizations = [{ Name: AUTHORIZATIONS.CREATE_IN_CUSTOM_SCHEMA, UserCanExecute: () => true }];
            mockState.protectedSchemas = new Set(['__mj']); // only __mj, no env-var extras

            const validator = makeValidator();
            const blockedDef = { ...VALID_TABLE_DEFINITION, SchemaName: '__mj' };
            const result = await validator.executeAgentInternal(
                makeParams(makeCreatePayload(blockedDef)),
                {} as AgentConfiguration
            );

            const payload = result.finalStep.newPayload as DatabaseDesignerPayload;
            expect(payload.ValidationResult?.Valid).toBe(false);
            expect(payload.ValidationResult?.Errors[0]).toContain('__mj');
        });

        it('blocks a custom schema added via RSU_PROTECTED_SCHEMAS env-var', async () => {
            mockState.authorizations = [{ Name: AUTHORIZATIONS.CREATE_IN_CUSTOM_SCHEMA, UserCanExecute: () => true }];
            mockState.protectedSchemas = new Set(['__mj', 'myschema']);

            const validator = makeValidator();
            const blockedDef = { ...VALID_TABLE_DEFINITION, SchemaName: 'myschema' };
            const result = await validator.executeAgentInternal(
                makeParams(makeCreatePayload(blockedDef)),
                {} as AgentConfiguration
            );

            const payload = result.finalStep.newPayload as DatabaseDesignerPayload;
            expect(payload.ValidationResult?.Valid).toBe(false);
            expect(payload.ValidationResult?.Errors[0]).toContain('myschema');
        });

        it('does not block __mj_UDT — that is the intended schema for user tables', async () => {
            mockState.authorizations = [AUTH_CREATE_UDT];
            // RSM only knows about __mj, not __mj_UDT
            mockState.protectedSchemas = new Set(['__mj']);

            const validator = makeValidator();
            const result = await validator.executeAgentInternal(
                makeParams(makeCreatePayload()),
                {} as AgentConfiguration
            );

            const payload = result.finalStep.newPayload as DatabaseDesignerPayload;
            expect(payload.ValidationResult?.Valid).toBe(true);
        });
    });

    describe('executeAgentInternal — column and naming checks', () => {
        it('returns Valid=false when a CodeGen reserved column is present', async () => {
            mockState.authorizations = [AUTH_CREATE_UDT];

            const validator = makeValidator();
            const reservedColDef = {
                ...VALID_TABLE_DEFINITION,
                Columns: [
                    { Name: 'ID', Type: 'uuid' as const, IsNullable: false },
                    { Name: 'Title', Type: 'string' as const, IsNullable: false },
                ],
            };
            const result = await validator.executeAgentInternal(
                makeParams(makeCreatePayload(reservedColDef)),
                {} as AgentConfiguration
            );

            const payload = result.finalStep.newPayload as DatabaseDesignerPayload;
            expect(payload.ValidationResult?.Valid).toBe(false);
            expect(payload.ValidationResult?.Errors.some(e => e.includes("'ID'"))).toBe(true);
        });

        it('returns Valid=true when the definition is fully valid', async () => {
            mockState.authorizations = [AUTH_CREATE_UDT];

            const validator = makeValidator();
            const result = await validator.executeAgentInternal(
                makeParams(makeCreatePayload()),
                {} as AgentConfiguration
            );

            const payload = result.finalStep.newPayload as DatabaseDesignerPayload;
            expect(payload.ValidationResult?.Valid).toBe(true);
            expect(payload.ValidationResult?.Errors).toHaveLength(0);
        });

        it('returns Valid=false when RunView finds a naming conflict for create', async () => {
            mockState.authorizations = [AUTH_CREATE_UDT];
            mockState.runViewResults = [{ ID: 'existing-id' }]; // entity already exists

            const validator = makeValidator();
            const result = await validator.executeAgentInternal(
                makeParams(makeCreatePayload()),
                {} as AgentConfiguration
            );

            const payload = result.finalStep.newPayload as DatabaseDesignerPayload;
            expect(payload.ValidationResult?.Valid).toBe(false);
            expect(payload.ValidationResult?.Errors.some(e => e.includes('already exists'))).toBe(true);
        });

        it('returns Valid=true for alter even when entity already exists (that is expected)', async () => {
            const modifyAuth = { Name: AUTHORIZATIONS.MODIFY_OWN_ENTITIES, UserCanExecute: () => true };
            mockState.authorizations = [modifyAuth];
            // Entity exists — this is what alter expects (runViewResults used for MJ: Entities check)
            mockState.runViewResults = [{ ID: 'existing-id' }];
            mockState.settingsResults = [
                { Name: UDT_SETTINGS.SOURCE_KEY, Value: UDT_SETTINGS.SOURCE_DATABASE_DESIGNER },
                { Name: UDT_SETTINGS.OWNER_KEY, Value: 'user-1' },
            ];

            const validator = makeValidator();
            const result = await validator.executeAgentInternal(
                makeParams(makeAlterPayload(VALID_TABLE_DEFINITION, 'existing-id'), 'user-1'),
                {} as AgentConfiguration
            );

            const payload = result.finalStep.newPayload as DatabaseDesignerPayload;
            expect(payload.ValidationResult?.Valid).toBe(true);
        });

        it('returns Valid=false for alter when entity does not exist in MJ metadata', async () => {
            const modifyAuth = { Name: AUTHORIZATIONS.MODIFY_ANY_UDT_ENTITIES, UserCanExecute: () => true };
            mockState.authorizations = [modifyAuth];
            // Entity not found — alter should fail
            mockState.runViewResults = [];
            mockState.settingsResults = [];

            const validator = makeValidator();
            const result = await validator.executeAgentInternal(
                makeParams(makeAlterPayload()), // No ExistingEntityID → falls back to MODIFY_ANY_UDT_ENTITIES
                {} as AgentConfiguration
            );

            const payload = result.finalStep.newPayload as DatabaseDesignerPayload;
            expect(payload.ValidationResult?.Valid).toBe(false);
            expect(payload.ValidationResult?.Errors.some(e => e.includes('does not exist'))).toBe(true);
        });
    });

    describe('alter mode — ownership-based authorization', () => {
        it('requires only MODIFY_OWN_ENTITIES when contextUser is the entity owner', async () => {
            mockState.authorizations = [{
                Name: AUTHORIZATIONS.MODIFY_OWN_ENTITIES,
                UserCanExecute: () => true,
            }];
            mockState.runViewResults = [{ ID: 'entity-abc' }]; // entity exists → checkEntityMustExist passes
            mockState.settingsResults = [
                { Name: UDT_SETTINGS.SOURCE_KEY, Value: UDT_SETTINGS.SOURCE_DATABASE_DESIGNER },
                { Name: UDT_SETTINGS.OWNER_KEY, Value: 'user-1' },
            ];

            const validator = makeValidator();
            const result = await validator.executeAgentInternal(
                makeParams(makeAlterPayload(VALID_TABLE_DEFINITION, 'entity-abc'), 'user-1'),
                {} as AgentConfiguration
            );

            const payload = result.finalStep.newPayload as DatabaseDesignerPayload;
            expect(payload.ValidationResult?.Valid).toBe(true);
        });

        it('requires MODIFY_ANY_UDT_ENTITIES when contextUser is not the owner', async () => {
            // Only MODIFY_OWN_ENTITIES is granted — but owner is someone else → auth fails
            mockState.authorizations = [{
                Name: AUTHORIZATIONS.MODIFY_OWN_ENTITIES,
                UserCanExecute: () => true,
            }];
            mockState.settingsResults = [
                { Name: UDT_SETTINGS.SOURCE_KEY, Value: UDT_SETTINGS.SOURCE_DATABASE_DESIGNER },
                { Name: UDT_SETTINGS.OWNER_KEY, Value: 'other-user' },
            ];

            const validator = makeValidator();
            const result = await validator.executeAgentInternal(
                makeParams(makeAlterPayload(VALID_TABLE_DEFINITION, 'entity-abc'), 'user-1'),
                {} as AgentConfiguration
            );

            // Required auth is MODIFY_ANY_UDT_ENTITIES which is not in authorizations → Failed
            expect(result.finalStep.step).toBe('Failed');
            expect(result.finalStep.reasoning).toContain('Authorization');
        });

        it('falls back to MODIFY_ANY_UDT_ENTITIES when no MJ:UDT:Source record exists', async () => {
            // Entity was created outside Database Designer — no source record
            mockState.settingsResults = [];
            mockState.runViewResults = [{ ID: 'entity-abc' }]; // entity exists → checkEntityMustExist passes
            mockState.authorizations = [{
                Name: AUTHORIZATIONS.MODIFY_ANY_UDT_ENTITIES,
                UserCanExecute: () => true,
            }];

            const validator = makeValidator();
            const result = await validator.executeAgentInternal(
                makeParams(makeAlterPayload(VALID_TABLE_DEFINITION, 'entity-abc'), 'user-1'),
                {} as AgentConfiguration
            );

            const payload = result.finalStep.newPayload as DatabaseDesignerPayload;
            expect(payload.ValidationResult?.Valid).toBe(true);
        });

        it('treats UUID ownership match as case-insensitive (SQL Server uppercase vs PostgreSQL lowercase)', async () => {
            // SQL Server stores UUIDs uppercase; contextUser.ID might be lowercase (or vice versa)
            mockState.authorizations = [{
                Name: AUTHORIZATIONS.MODIFY_OWN_ENTITIES,
                UserCanExecute: () => true,
            }];
            mockState.runViewResults = [{ ID: 'entity-abc' }]; // entity exists → checkEntityMustExist passes
            // Owner stored as uppercase UUID, contextUser ID as lowercase
            mockState.settingsResults = [
                { Name: UDT_SETTINGS.SOURCE_KEY, Value: UDT_SETTINGS.SOURCE_DATABASE_DESIGNER },
                { Name: UDT_SETTINGS.OWNER_KEY, Value: 'ABCD-1234-EF56' },
            ];

            const validator = makeValidator();
            const result = await validator.executeAgentInternal(
                makeParams(makeAlterPayload(VALID_TABLE_DEFINITION, 'entity-abc'), 'abcd-1234-ef56'),
                {} as AgentConfiguration
            );

            // UUIDsEqual normalises case → should match → MODIFY_OWN_ENTITIES is sufficient
            const payload = result.finalStep.newPayload as DatabaseDesignerPayload;
            expect(payload.ValidationResult?.Valid).toBe(true);
        });

        it('falls back to MODIFY_ANY_UDT_ENTITIES when ExistingEntityID is absent', async () => {
            mockState.authorizations = [{
                Name: AUTHORIZATIONS.MODIFY_ANY_UDT_ENTITIES,
                UserCanExecute: () => true,
            }];
            mockState.runViewResults = [{ ID: 'some-entity-id' }]; // entity exists → checkEntityMustExist passes

            const validator = makeValidator();
            const result = await validator.executeAgentInternal(
                makeParams(makeAlterPayload()), // no ExistingEntityID
                {} as AgentConfiguration
            );

            const payload = result.finalStep.newPayload as DatabaseDesignerPayload;
            expect(payload.ValidationResult?.Valid).toBe(true);
        });
    });
});
