import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RunActionParams } from '@memberjunction/actions-base';

// ─── Hoisted mock state ──────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
    authorizations: [] as { Name: string; UserCanExecute: () => boolean }[],
    validationResult: {
        Valid: true,
        Errors: [] as string[],
        Warnings: [] as string[],
    },
}));

// ─── Mock all external dependencies ─────────────────────────────────────────

vi.mock('@memberjunction/core', () => ({
    Metadata: vi.fn().mockImplementation(function(this: unknown) {
        return { Authorizations: mockState.authorizations };
    }),
    AuthorizationEvaluator: vi.fn().mockImplementation(function(this: unknown) {
        return {
            UserCanExecuteWithAncestors: vi.fn().mockImplementation(
                (auth: { UserCanExecute?: () => boolean }) => auth?.UserCanExecute?.() ?? false
            ),
        };
    }),
    LogError: vi.fn(),
    UserInfo: vi.fn(),
}));

vi.mock('@memberjunction/database-designer-core', () => ({
    DatabaseSchemaValidationService: vi.fn().mockImplementation(function(this: unknown) {
        return {
            validate: vi.fn().mockImplementation(async () => mockState.validationResult),
        };
    }),
    AUTHORIZATIONS: {
        CREATE_IN_UDT_SCHEMA: 'Create in UDT Schema',
        CREATE_IN_CUSTOM_SCHEMA: 'Create in Custom Schema',
        MODIFY_OWN_ENTITIES: 'Modify Own Entities',
        MODIFY_ANY_UDT_ENTITIES: 'Modify Any UDT Entities',
    },
    UDT_SCHEMA_NAME: '__mj_UDT',
    DatabaseDesignerPipelineExecutor: {},
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (_target: unknown) => _target,
    LogError: vi.fn(),
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));

vi.mock('@memberjunction/schema-engine', () => ({}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { ValidateEntitySchemaAction } from '../actions/validate-entity-schema.action.js';
import { AUTHORIZATIONS } from '@memberjunction/database-designer-core';

// ─── Test helpers ─────────────────────────────────────────────────────────────

const CONTEXT_USER = { ID: 'user-1', Email: 'test@example.com' } as ReturnType<typeof vi.fn>;

const VALID_TABLE_DEFINITION = {
    SchemaName: '__mj_UDT',
    TableName: 'ProjectMilestones',
    EntityName: 'Project Milestones',
    Description: 'Milestones for projects',
    Columns: [{ Name: 'Title', Type: 'string', IsNullable: false }],
};

function makeParams(overrides: {
    tableDefinition?: unknown;
    modificationType?: string;
    contextUser?: unknown;
} = {}): RunActionParams {
    const params: { Name: string; Type: string; Value: unknown }[] = [];

    const td = overrides.tableDefinition !== undefined
        ? overrides.tableDefinition
        : VALID_TABLE_DEFINITION;
    if (td !== null) {
        params.push({ Name: 'TableDefinition', Type: 'Input', Value: td });
    }

    if (overrides.modificationType) {
        params.push({ Name: 'ModificationType', Type: 'Input', Value: overrides.modificationType });
    }

    return {
        Params: params,
        ContextUser: (overrides.contextUser ?? CONTEXT_USER) as ReturnType<typeof vi.fn>,
    } as unknown as RunActionParams;
}

// Access protected InternalRunAction for testing (standard MJ action test pattern)
type TestableAction = {
    InternalRunAction(params: RunActionParams): Promise<import('@memberjunction/actions-base').ActionResultSimple>;
};

function makeAction(): TestableAction {
    return new ValidateEntitySchemaAction() as unknown as TestableAction;
}

const AUTH_CREATE_UDT = { Name: AUTHORIZATIONS.CREATE_IN_UDT_SCHEMA, UserCanExecute: () => true };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ValidateEntitySchemaAction', () => {
    beforeEach(() => {
        mockState.authorizations = [];
        mockState.validationResult = { Valid: true, Errors: [], Warnings: [] };
    });

    describe('parameter validation', () => {
        it('returns MISSING_PARAMETER when TableDefinition is absent', async () => {
            const action = makeAction();
            const result = await action.InternalRunAction(makeParams({ tableDefinition: null }));

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('MISSING_PARAMETER');
        });

        it('returns INVALID_TABLE_DEFINITION when TableDefinition is not a valid object', async () => {
            const action = makeAction();
            const result = await action.InternalRunAction(makeParams({ tableDefinition: '{bad json}' }));

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_TABLE_DEFINITION');
        });
    });

    describe('authorization', () => {
        it('returns UNAUTHORIZED when contextUser lacks the required auth', async () => {
            // authorizations stays [] — no auth configured → access denied
            const action = makeAction();
            const result = await action.InternalRunAction(makeParams());

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('UNAUTHORIZED');
        });

        it('proceeds to validation when user holds the required authorization', async () => {
            mockState.authorizations = [AUTH_CREATE_UDT];
            const action = makeAction();
            const result = await action.InternalRunAction(makeParams());

            // Auth passed — result code is from validation, not auth
            expect(result.ResultCode).not.toBe('UNAUTHORIZED');
        });
    });

    describe('validation outcomes', () => {
        it('returns VALIDATION_PASSED (Success=true) when the definition is valid', async () => {
            mockState.authorizations = [AUTH_CREATE_UDT];
            mockState.validationResult = { Valid: true, Errors: [], Warnings: [] };

            const action = makeAction();
            const result = await action.InternalRunAction(makeParams());

            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('VALIDATION_PASSED');
        });

        it('returns VALIDATION_FAILED (Success=true) when the definition has errors', async () => {
            mockState.authorizations = [AUTH_CREATE_UDT];
            mockState.validationResult = {
                Valid: false,
                Errors: ['Schema dbo is protected'],
                Warnings: [],
            };

            const action = makeAction();
            const result = await action.InternalRunAction(makeParams());

            // Success=true because the action itself succeeded (validation is the output)
            expect(result.Success).toBe(true);
            expect(result.ResultCode).toBe('VALIDATION_FAILED');
            expect(result.Message).toContain('Schema dbo is protected');
        });

        it('writes ValidationResult as an output param', async () => {
            mockState.authorizations = [AUTH_CREATE_UDT];
            mockState.validationResult = { Valid: true, Errors: [], Warnings: ['Minor advisory'] };

            const params = makeParams();
            const action = makeAction();
            await action.InternalRunAction(params);

            const outputParam = params.Params.find(p => p.Name === 'ValidationResult');
            expect(outputParam).toBeDefined();
            expect(outputParam?.Value).toMatchObject({
                Valid: true,
                Warnings: ['Minor advisory'],
            });
        });

        it('writes ValidationResult output even when validation fails', async () => {
            mockState.authorizations = [AUTH_CREATE_UDT];
            mockState.validationResult = {
                Valid: false,
                Errors: ['Reserved column ID'],
                Warnings: [],
            };

            const params = makeParams();
            const action = makeAction();
            await action.InternalRunAction(params);

            const outputParam = params.Params.find(p => p.Name === 'ValidationResult');
            expect(outputParam?.Value).toMatchObject({
                Valid: false,
                Errors: ['Reserved column ID'],
            });
        });
    });

    describe('ModificationType routing', () => {
        it('defaults to create modification type when ModificationType is absent', async () => {
            // __mj_UDT schema → CREATE_IN_UDT_SCHEMA auth required
            mockState.authorizations = [AUTH_CREATE_UDT];
            const action = makeAction();
            const result = await action.InternalRunAction(makeParams());

            expect(result.ResultCode).toBe('VALIDATION_PASSED');
        });

        it('uses MODIFY_OWN_ENTITIES auth when ModificationType is alter', async () => {
            mockState.authorizations = [{
                Name: AUTHORIZATIONS.MODIFY_OWN_ENTITIES,
                UserCanExecute: () => true,
            }];
            const action = makeAction();
            const result = await action.InternalRunAction(makeParams({ modificationType: 'alter' }));

            expect(result.ResultCode).not.toBe('UNAUTHORIZED');
        });
    });
});
