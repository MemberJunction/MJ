/**
 * The SQL CodeGen emits to record a newly generated validator in `GeneratedCode`.
 *
 * Every table-level validator of an entity links to the same row (the entity itself), so the
 * insert guard has to name the validator too. A guard keyed by the entity alone lets the first
 * table-level insert through and skips every one after it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executed, validators } = vi.hoisted(() => ({
    executed: [] as string[],
    validators: [] as Array<Record<string, unknown>>,
}));

vi.mock('mssql', () => ({ default: {} }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockMetadata {
        EntityByName(name: string): { ID: string } {
            return { ID: name === 'MJ: Entities' ? 'ENTITIES-ENTITY-ID' : 'FIELDS-ENTITY-ID' };
        }
    }
    return { ...actual, Metadata: MockMetadata };
});

vi.mock('../Misc/status_logging', () => ({
    logError: vi.fn(),
    logStatus: vi.fn(),
    LogWarning: vi.fn(),
    get logWarning() { return this.LogWarning; },
}));

vi.mock('../Database/manage-metadata', () => ({
    ValidatorResult: class {},
    ManageMetadataBase: { generatedValidators: validators },
}));

vi.mock('../Config/config', () => ({
    configInfo: {},
    MjCoreSchema: () => '__mj',
    DbPlatform: () => 'sqlserver',
    ResolveEntityImportPackage: vi.fn(),
}));

vi.mock('../Misc/sql_logging', () => ({
    SQLLogging: {
        LogSQLAndExecute: vi.fn(async (_pool: unknown, sql: string) => { executed.push(sql); }),
    },
}));

vi.mock('../Database/codeGenDatabaseProvider', () => ({
    ResolveCodeGenDatabaseProvider: () => ({
        conditionalInsertSQL: (checkQuery: string, insertSQL: string) => `IF NOT EXISTS (${checkQuery}) BEGIN ${insertSQL} END`,
    }),
}));

import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { EntityInfo } from '@memberjunction/core';
import { EntitySubClassGeneratorBase } from '../Misc/entity_subclasses_codegen';
import type { CodeGenConnection } from '../Database/codeGenDatabaseProvider';

const ENTITY_ID = '139AB3B7-C1AB-49BD-A473-47D45A962578';
const FIELD_ID = '4000B0D2-DBCD-45BE-8367-2537F2B9F6A4';

const entity = {
    ID: ENTITY_ID,
    Name: 'MJ: Entity Form Contributions',
    Fields: [{ ID: FIELD_ID, Name: 'ReplacesFieldNames' }],
} as unknown as EntityInfo;

const pool = { Dialect: new SQLServerDialect() } as unknown as CodeGenConnection;

function validator(functionName: string, fieldName?: string): Record<string, unknown> {
    return {
        entityName: entity.Name,
        fieldName,
        sourceCheckConstraint: `(${functionName})`,
        functionText: `public ${functionName}(result: ValidationResult) {\n}`,
        functionName,
        functionDescription: `${functionName} description`,
        generatedCodeId: '',
        aiModelID: 'MODEL-ID',
        wasGenerated: true,
        success: true,
    };
}

/** The `IF NOT EXISTS (...)` guard emitted for one validator, found by its function name. */
function guardFor(sql: string, functionName: string): string {
    const insertAt = sql.indexOf(`'public ${functionName}(`);
    const guardAt = sql.lastIndexOf('IF NOT EXISTS (', insertAt);
    return sql.slice(guardAt, sql.indexOf(') BEGIN', guardAt));
}

describe('validator GeneratedCode insert guard', () => {
    beforeEach(() => {
        executed.length = 0;
        validators.length = 0;
    });

    it('names each table-level validator in its guard, so every one of them is inserted', async () => {
        validators.push(
            validator('ValidateMutuallyExclusiveReplacementAndRelationshipFields'),
            validator('ValidatePresentationBareInclusionAndChromeGroup'),
            validator('ValidateScopeAssociations'),
        );

        await new EntitySubClassGeneratorBase().LogAndGenerateValidateFunction(pool, entity, false);

        expect(executed).toHaveLength(1);
        for (const name of [
            'ValidateMutuallyExclusiveReplacementAndRelationshipFields',
            'ValidatePresentationBareInclusionAndChromeGroup',
            'ValidateScopeAssociations',
        ]) {
            const guard = guardFor(executed[0], name);
            expect(guard).toContain(`[LinkedEntityID] = 'ENTITIES-ENTITY-ID'`);
            expect(guard).toContain(`[LinkedRecordPrimaryKey] = '${ENTITY_ID}'`);
            expect(guard).toContain(`AND [Name] = '${name}'`);
        }
    });

    it('keeps a field-level guard keyed by the field', async () => {
        validators.push(validator('ValidateReplacesFieldNamesIsNonEmptyJsonArray', 'ReplacesFieldNames'));

        await new EntitySubClassGeneratorBase().LogAndGenerateValidateFunction(pool, entity, false);

        const guard = guardFor(executed[0], 'ValidateReplacesFieldNamesIsNonEmptyJsonArray');
        expect(guard).toContain(`[LinkedEntityID] = 'FIELDS-ENTITY-ID'`);
        expect(guard).toContain(`[LinkedRecordPrimaryKey] = '${FIELD_ID}'`);
        expect(guard).not.toContain('[Name] =');
    });
});
