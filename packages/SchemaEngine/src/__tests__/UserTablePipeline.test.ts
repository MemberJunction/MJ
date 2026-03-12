import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    UserTablePipeline,
    ValidateUserTableDefinition,
    DisplayNameToSqlName,
    GenerateUDTTableName,
    GenerateUDTEntityName,
} from '../UserTablePipeline.js';
import type { UserTableDefinition } from '../UserTablePipeline.js';
import { RuntimeSchemaManager } from '../RuntimeSchemaManager.js';

// ─── Helper ──────────────────────────────────────────────────────────

function MakeValidDef(overrides: Partial<UserTableDefinition> = {}): UserTableDefinition {
    return {
        DisplayName: 'Project Milestones',
        Description: 'Track project milestones',
        Columns: [
            { Name: 'Name', Type: 'string', MaxLength: 200 },
            { Name: 'Due Date', Type: 'datetime', AllowEmpty: true },
            { Name: 'Status', Type: 'string', MaxLength: 50, DefaultValue: "'Pending'" },
        ],
        ...overrides,
    };
}

// ─── Name Conversion Tests ───────────────────────────────────────────

describe('DisplayNameToSqlName', () => {
    it('should convert space-separated words to PascalCase', () => {
        expect(DisplayNameToSqlName('Project Milestones')).toBe('ProjectMilestones');
    });

    it('should handle single words', () => {
        expect(DisplayNameToSqlName('Status')).toBe('Status');
    });

    it('should handle hyphens and underscores', () => {
        expect(DisplayNameToSqlName('due-date')).toBe('DueDate');
        expect(DisplayNameToSqlName('due_date')).toBe('DueDate');
    });

    it('should handle lowercase input', () => {
        expect(DisplayNameToSqlName('first name')).toBe('FirstName');
    });
});

describe('GenerateUDTTableName', () => {
    it('should prefix with UD_', () => {
        expect(GenerateUDTTableName('Project Milestones')).toBe('UD_ProjectMilestones');
    });
});

describe('GenerateUDTEntityName', () => {
    it('should prefix with User: ', () => {
        expect(GenerateUDTEntityName('Project Milestones')).toBe('User: Project Milestones');
    });
});

// ─── Validation Tests ────────────────────────────────────────────────

describe('ValidateUserTableDefinition', () => {
    it('should accept a valid definition', () => {
        const result = ValidateUserTableDefinition(MakeValidDef());
        expect(result.Valid).toBe(true);
        expect(result.Errors).toHaveLength(0);
    });

    it('should reject empty DisplayName', () => {
        const result = ValidateUserTableDefinition(MakeValidDef({ DisplayName: '' }));
        expect(result.Valid).toBe(false);
        expect(result.Errors[0]).toContain('DisplayName is required');
    });

    it('should reject DisplayName starting with a number', () => {
        const result = ValidateUserTableDefinition(MakeValidDef({ DisplayName: '123 Table' }));
        expect(result.Valid).toBe(false);
        expect(result.Errors[0]).toContain('must start with a letter');
    });

    it('should reject reserved prefixes', () => {
        const result = ValidateUserTableDefinition(MakeValidDef({ DisplayName: '__mj_custom' }));
        expect(result.Valid).toBe(false);
        expect(result.Errors.some(e => e.includes('reserved prefix'))).toBe(true);
    });

    it('should reject empty column list', () => {
        const result = ValidateUserTableDefinition(MakeValidDef({ Columns: [] }));
        expect(result.Valid).toBe(false);
        expect(result.Errors[0]).toContain('At least one column');
    });

    it('should reject too many columns', () => {
        const columns = Array.from({ length: 51 }, (_, i) => ({
            Name: `Col${i}`, Type: 'string' as const,
        }));
        const result = ValidateUserTableDefinition(MakeValidDef({ Columns: columns }));
        expect(result.Valid).toBe(false);
        expect(result.Errors[0]).toContain('Maximum 50');
    });

    it('should reject reserved column names', () => {
        const result = ValidateUserTableDefinition(MakeValidDef({
            Columns: [{ Name: 'ID', Type: 'uuid' }],
        }));
        expect(result.Valid).toBe(false);
        expect(result.Errors.some(e => e.includes('reserved'))).toBe(true);
    });

    it('should reject duplicate column names', () => {
        const result = ValidateUserTableDefinition(MakeValidDef({
            Columns: [
                { Name: 'Name', Type: 'string' },
                { Name: 'Name', Type: 'string' },
            ],
        }));
        expect(result.Valid).toBe(false);
        expect(result.Errors.some(e => e.includes('Duplicate'))).toBe(true);
    });
});

// ─── Pipeline Tests ──────────────────────────────────────────────────

describe('UserTablePipeline', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('should return validation errors without calling RSU', async () => {
        const pipeline = new UserTablePipeline();
        const result = await pipeline.CreateTable(MakeValidDef({ DisplayName: '' }));

        expect(result.Success).toBe(false);
        expect(result.ValidationErrors).toBeDefined();
        expect(result.ValidationErrors!.length).toBeGreaterThan(0);
    });

    it('should enforce rate limiting', async () => {
        // Use a very short rate limit for testing
        const pipeline = new UserTablePipeline(5000); // 5 seconds
        // Simulate a recent create
        (pipeline as unknown as { _lastCreateTime: number })._lastCreateTime = Date.now();

        const result = await pipeline.CreateTable(MakeValidDef());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('Rate limited');
    });

    it('should call RuntimeSchemaManager.RunPipeline with correct input', async () => {
        const pipeline = new UserTablePipeline(0); // No rate limiting for test

        const mockResult = {
            Success: true,
            APIRestarted: true,
            GitCommitSuccess: false,
            Steps: [{ Name: 'Mock', Status: 'success' as const, DurationMs: 10, Message: 'ok' }],
        };

        // Enable RSU
        vi.stubEnv('ALLOW_RUNTIME_SCHEMA_UPDATE', '1');

        const runPipelineSpy = vi.spyOn(RuntimeSchemaManager.Instance, 'RunPipeline')
            .mockResolvedValue(mockResult);

        const result = await pipeline.CreateTable(MakeValidDef({ SkipRestart: true, SkipGitCommit: true }));

        expect(runPipelineSpy).toHaveBeenCalledOnce();

        const rsuInput = runPipelineSpy.mock.calls[0][0];
        expect(rsuInput.Description).toContain('Project Milestones');
        expect(rsuInput.AffectedTables).toContain('custom.UD_ProjectMilestones');
        expect(rsuInput.MigrationSQL).toContain('CREATE TABLE');
        expect(rsuInput.MigrationSQL).toContain('UD_ProjectMilestones');
        expect(rsuInput.SkipRestart).toBe(true);
        expect(rsuInput.SkipGitCommit).toBe(true);

        expect(result.Success).toBe(true);
        expect(result.SqlTableName).toBe('custom.UD_ProjectMilestones');
        expect(result.EntityName).toBe('User: Project Milestones');
    });

    it('should return error when RSU is disabled', async () => {
        const pipeline = new UserTablePipeline(0);
        vi.stubEnv('ALLOW_RUNTIME_SCHEMA_UPDATE', '0');

        const result = await pipeline.CreateTable(MakeValidDef());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('disabled');
    });
});

// ─── Preview Tests ───────────────────────────────────────────────────

describe('UserTablePipeline.Preview', () => {
    it('should return migration SQL without executing', () => {
        const pipeline = new UserTablePipeline();
        const preview = pipeline.Preview(MakeValidDef());

        expect(preview.Valid).toBe(true);
        expect(preview.SqlTableName).toBe('custom.UD_ProjectMilestones');
        expect(preview.EntityName).toBe('User: Project Milestones');
        expect(preview.MigrationSQL).toContain('CREATE TABLE');
        expect(preview.MigrationSQL).toContain('UD_ProjectMilestones');
        expect(preview.MigrationSQL).toContain('Name');
        expect(preview.MigrationSQL).toContain('DueDate');
        expect(preview.MigrationSQL).toContain('Status');
    });

    it('should return validation errors in preview', () => {
        const pipeline = new UserTablePipeline();
        const preview = pipeline.Preview(MakeValidDef({ DisplayName: '' }));

        expect(preview.Valid).toBe(false);
        expect(preview.ValidationErrors.length).toBeGreaterThan(0);
        expect(preview.MigrationSQL).toBe('');
    });

    it('should generate SQL Server DDL by default', () => {
        const pipeline = new UserTablePipeline();
        const preview = pipeline.Preview(MakeValidDef());

        // SQL Server uses bracket quoting
        expect(preview.MigrationSQL).toContain('[custom]');
        expect(preview.MigrationSQL).toContain('[UD_ProjectMilestones]');
    });

    it('should generate PostgreSQL DDL when specified', () => {
        const pipeline = new UserTablePipeline();
        const preview = pipeline.Preview(MakeValidDef({ Platform: 'postgresql' }));

        // PostgreSQL uses double-quote identifiers
        expect(preview.MigrationSQL).toContain('"custom"');
        expect(preview.MigrationSQL).toContain('"UD_ProjectMilestones"');
    });

    it('should handle foreign keys in preview', () => {
        const pipeline = new UserTablePipeline();
        const preview = pipeline.Preview(MakeValidDef({
            ForeignKeys: [{
                ColumnName: 'Owner User',
                ReferencedSchema: '__mj',
                ReferencedTable: 'User',
            }],
        }));

        expect(preview.Valid).toBe(true);
        // Soft FKs don't produce SQL constraints, so no FK SQL
        // But the table definition should include the column
    });
});
