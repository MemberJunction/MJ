import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Hoisted mock state ──────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
    /** Results returned by the naming-conflict RunView (MJ: Entities). */
    runViewResults: [] as unknown[],
    /** Schemas returned by RuntimeSchemaManager.GetAllProtectedSchemas(). */
    protectedSchemas: new Set<string>(['__mj', 'dbo', 'sys', 'information_schema']),
    /** SchemaEngine validation outcome. */
    schemaEngineResult: { Valid: true, Errors: [] as string[], Warnings: [] as string[] },
}));

// ─── Mock all external dependencies ─────────────────────────────────────────

vi.mock('@memberjunction/core', () => ({
    RunView: vi.fn().mockImplementation(function(this: unknown) {
        return {
            RunView: vi.fn().mockImplementation(async () => ({
                Success: true,
                Results: mockState.runViewResults,
                RowCount: mockState.runViewResults.length,
            })),
        };
    }),
    LogError: vi.fn(),
    UserInfo: vi.fn(),
}));

vi.mock('@memberjunction/schema-engine', () => ({
    SchemaValidator: {
        Validate: vi.fn().mockImplementation(() => mockState.schemaEngineResult),
    },
    RuntimeSchemaManager: {
        Instance: {
            GetAllProtectedSchemas: vi.fn(() => mockState.protectedSchemas),
        },
    },
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { DatabaseSchemaValidationService } from '../database-schema-validation.service.js';
import type { TableDefinition } from '@memberjunction/schema-engine';

// ─── Test helpers ─────────────────────────────────────────────────────────────

const CONTEXT_USER = { ID: 'user-1', Email: 'test@example.com' } as ReturnType<typeof vi.fn>;

const VALID_DEFINITION: TableDefinition = {
    SchemaName: '__mj_UDT',
    TableName: 'ProjectMilestones',
    EntityName: 'Project Milestones',
    Description: 'Milestones for projects',
    Columns: [
        { Name: 'Title', Type: 'string' as const, IsNullable: false },
        { Name: 'DueDate', Type: 'datetime' as const, IsNullable: true },
    ],
};

function makeService(): DatabaseSchemaValidationService {
    return new DatabaseSchemaValidationService();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DatabaseSchemaValidationService', () => {
    beforeEach(() => {
        mockState.runViewResults = [];
        mockState.protectedSchemas = new Set(['__mj', 'dbo', 'sys', 'information_schema']);
        mockState.schemaEngineResult = { Valid: true, Errors: [], Warnings: [] };
    });

    describe('validate() — schema blocklist (Check 1)', () => {
        it('rejects dbo schema and short-circuits (no further checks run)', async () => {
            const service = makeService();
            const def = { ...VALID_DEFINITION, SchemaName: 'dbo' };

            const result = await service.validate(def, CONTEXT_USER);

            expect(result.Valid).toBe(false);
            expect(result.Errors).toHaveLength(1);
            expect(result.Errors[0]).toContain('dbo');
            // Warnings should be empty since we short-circuit after the blocklist
            expect(result.Warnings).toHaveLength(0);
        });

        it('rejects __mj schema — hardcoded protection regardless of env-var config', async () => {
            mockState.protectedSchemas = new Set(['__mj']); // minimal set, no env-var extras
            const service = makeService();
            const def = { ...VALID_DEFINITION, SchemaName: '__mj' };

            const result = await service.validate(def, CONTEXT_USER);

            expect(result.Valid).toBe(false);
            expect(result.Errors[0]).toContain('__mj');
        });

        it('rejects a custom schema added via RSU_PROTECTED_SCHEMAS', async () => {
            mockState.protectedSchemas = new Set(['__mj', 'restricted_internal']);
            const service = makeService();
            const def = { ...VALID_DEFINITION, SchemaName: 'restricted_internal' };

            const result = await service.validate(def, CONTEXT_USER);

            expect(result.Valid).toBe(false);
            expect(result.Errors[0]).toContain('restricted_internal');
        });

        it('allows __mj_UDT — this is the intended user-table schema', async () => {
            // RSM never blocks __mj_UDT (only __mj and env-var extras)
            mockState.protectedSchemas = new Set(['__mj']);
            const service = makeService();

            const result = await service.validate(VALID_DEFINITION, CONTEXT_USER);

            expect(result.Valid).toBe(true);
        });

        it('schema check is case-insensitive', async () => {
            const service = makeService();
            const def = { ...VALID_DEFINITION, SchemaName: 'DBO' }; // uppercase

            const result = await service.validate(def, CONTEXT_USER);

            expect(result.Valid).toBe(false);
            expect(result.Errors[0]).toContain('DBO');
        });
    });

    describe('validate() — SchemaEngine structural validation (Check 2)', () => {
        it('surfaces SchemaEngine errors in the result', async () => {
            mockState.schemaEngineResult = {
                Valid: false,
                Errors: ['Table name contains illegal characters'],
                Warnings: [],
            };
            const service = makeService();

            const result = await service.validate(VALID_DEFINITION, CONTEXT_USER);

            expect(result.Valid).toBe(false);
            expect(result.Errors).toContain('Table name contains illegal characters');
        });

        it('surfaces SchemaEngine warnings without marking result invalid', async () => {
            mockState.schemaEngineResult = {
                Valid: true,
                Errors: [],
                Warnings: ['Column count is unusually large'],
            };
            const service = makeService();

            const result = await service.validate(VALID_DEFINITION, CONTEXT_USER);

            expect(result.Valid).toBe(true);
            expect(result.Warnings).toContain('Column count is unusually large');
        });
    });

    describe('validate() — reserved column names (Check 3)', () => {
        it('rejects definition containing the reserved "ID" column', async () => {
            const service = makeService();
            const def: TableDefinition = {
                ...VALID_DEFINITION,
                Columns: [
                    { Name: 'ID', Type: 'uuid' as const, IsNullable: false },
                    { Name: 'Title', Type: 'string' as const, IsNullable: false },
                ],
            };

            const result = await service.validate(def, CONTEXT_USER);

            expect(result.Valid).toBe(false);
            expect(result.Errors.some(e => e.includes("'ID'"))).toBe(true);
        });

        it('rejects definition containing __mj_CreatedAt', async () => {
            const service = makeService();
            const def: TableDefinition = {
                ...VALID_DEFINITION,
                Columns: [
                    { Name: '__mj_CreatedAt', Type: 'datetime' as const, IsNullable: false },
                ],
            };

            const result = await service.validate(def, CONTEXT_USER);

            expect(result.Valid).toBe(false);
            expect(result.Errors.some(e => e.includes("'__mj_CreatedAt'"))).toBe(true);
        });

        it('reserved column check is case-insensitive', async () => {
            const service = makeService();
            const def: TableDefinition = {
                ...VALID_DEFINITION,
                Columns: [
                    { Name: 'id', Type: 'uuid' as const, IsNullable: false }, // lowercase
                ],
            };

            const result = await service.validate(def, CONTEXT_USER);

            expect(result.Valid).toBe(false);
            expect(result.Errors.some(e => e.includes("'id'"))).toBe(true);
        });
    });

    describe('validate() — naming conflict check (Check 4)', () => {
        it('rejects when RunView finds a matching entity name or table', async () => {
            mockState.runViewResults = [{ ID: 'existing-entity-id' }];
            const service = makeService();

            const result = await service.validate(VALID_DEFINITION, CONTEXT_USER);

            expect(result.Valid).toBe(false);
            expect(result.Errors.some(e => e.includes('already exists'))).toBe(true);
        });

        it('passes when RunView finds no matching entity', async () => {
            mockState.runViewResults = []; // no conflict
            const service = makeService();

            const result = await service.validate(VALID_DEFINITION, CONTEXT_USER);

            expect(result.Valid).toBe(true);
        });
    });

    describe('validate() — happy path', () => {
        it('returns Valid=true with no errors or warnings for a clean definition', async () => {
            const service = makeService();

            const result = await service.validate(VALID_DEFINITION, CONTEXT_USER);

            expect(result.Valid).toBe(true);
            expect(result.Errors).toHaveLength(0);
            expect(result.Warnings).toHaveLength(0);
        });

        it('passes with undefined contextUser (service is resilient to missing context)', async () => {
            const service = makeService();

            const result = await service.validate(VALID_DEFINITION, undefined);

            expect(result.Valid).toBe(true);
        });
    });
});
