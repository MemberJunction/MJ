/**
 * A VALUE LIST ON A BOOLEAN FIELD MUST NOT BECOME A LITERAL UNION.
 *
 * A value list becomes a literal union in two places — the getter/setter type and the Zod schema — and each
 * value is quoted only when the field `NeedsQuotes`. A boolean (`bit` on SQL Server, `boolean` on PostgreSQL)
 * never does, but its value list still holds STRINGS. So a declared value list of "False"/"True" — which
 * DbAutoDoc emitted for two `bit` columns of an integration schema — came out as the bare identifiers
 * `False | True` and `z.union([z.literal(False), z.literal(True)])`, and the generated package stopped
 * compiling (TS2304: Cannot find name 'False' / 'True'). Every CodeGen run's build failed from then on.
 *
 * A boolean field keeps `boolean` / `z.boolean()`. Its values are still listed in the doc comment, and string
 * and numeric value lists are unchanged.
 *
 * Built from REAL EntityInfo / EntityFieldInfo objects so that ValueListTypeEnum, NeedsQuotes and the SQL type
 * mapping are the ones CodeGen actually uses.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('mssql', () => ({ default: {} }));
vi.mock('../Database/manage-metadata', () => ({
    ValidatorResult: class {},
    ManageMetadataBase: class {
        static generatedValidators: unknown[] = [];
    },
}));
vi.mock('../Config/config', () => ({
    MjCoreSchema: () => '__mj',
    configInfo: {},
    ResolveEntityPackageName: () => 'mj_generatedentities',
    ResolveEntityImportPackage: () => {
        throw new Error('ResolveEntityImportPackage should not be called for an entity with no peer embeds');
    },
}));

import ts from 'typescript';
import { EntityInfo } from '@memberjunction/core';
import { EntitySubClassGeneratorBase } from '../Misc/entity_subclasses_codegen';
import type { CodeGenConnection } from '../Database/codeGenDatabaseProvider';

function field(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
        EntityID: 'E1', Entity: 'Classifications', SchemaName: 'netsuite', BaseTable: 'classification',
        BaseView: 'vwclassification', AllowsNull: true, IsVirtual: false, AllowUpdateAPI: true, IsPrimaryKey: false,
        IsUnique: false, AutoIncrement: false, DefaultValue: null, RelatedEntityID: null, Precision: 0, Scale: 0,
        ValueListType: 'None', Status: 'Active',
        ...overrides,
    };
}

function values(fieldID: string, list: string[]): Array<Record<string, unknown>> {
    return list.map((v, i) => ({ ID: `${fieldID}-v${i}`, EntityFieldID: fieldID, Sequence: i + 1, Value: v, Code: v }));
}

/** One entity carrying a boolean value list, plus a string and a numeric one as controls. */
function classifications(): EntityInfo {
    return new EntityInfo({
        ID: 'E1', Name: 'Classifications', SchemaName: 'netsuite', BaseTable: 'classification', BaseView: 'vwclassification',
        CodeName: 'classification', ClassName: 'netsuiteclassification', BaseTableCodeName: 'classification',
        IncludeInAPI: true, VirtualEntity: false, BaseViewGenerated: true, TrackRecordChanges: false,
        AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true,
        EntityFields: [
            field({ ID: 'F1', Name: 'id', Type: 'nvarchar', Length: 200, MaxLength: 200, IsPrimaryKey: true, IsUnique: true, AllowsNull: false, Sequence: 1 }),
            field({ ID: 'F2', Name: 'IsTombstoned', Type: 'bit', Length: 1, Sequence: 2, ValueListType: 'List', EntityFieldValues: values('F2', ['False', 'True']) }),
            field({ ID: 'F3', Name: 'IsInactive', Type: 'bit', Length: 1, Sequence: 3, AllowsNull: false, ValueListType: 'ListOrUserEntry', EntityFieldValues: values('F3', ['False', 'True']) }),
            field({ ID: 'F4', Name: 'SyncStatus', Type: 'nvarchar', Length: 40, MaxLength: 40, Sequence: 4, ValueListType: 'List', EntityFieldValues: values('F4', ['Active', 'Inactive']) }),
            field({ ID: 'F5', Name: 'Priority', Type: 'int', Length: 4, Sequence: 5, ValueListType: 'List', EntityFieldValues: values('F5', ['1', '2']) }),
        ],
    });
}

const POOL = {} as unknown as CodeGenConnection;

/**
 * TypeScript's verdict on one generated property type, checked on its own: the codes of its semantic errors.
 * `noLib` keeps it to the type expression itself — `boolean`, `null` and literal types need no lib.
 */
function typeErrors(typeText: string): number[] {
    const fileName = 'probe.ts';
    const source = `export declare let probe: ${typeText};\n`;
    const options: ts.CompilerOptions = { noLib: true, types: [], strict: true, noEmit: true };
    const host = ts.createCompilerHost(options);
    const fromDisk = host.getSourceFile.bind(host);
    host.getSourceFile = (name, languageVersion) =>
        name === fileName ? ts.createSourceFile(name, source, languageVersion) : fromDisk(name, languageVersion);
    const program = ts.createProgram([fileName], options, host);
    return program.getSemanticDiagnostics(program.getSourceFile(fileName)).map((d) => d.code);
}

describe('value lists on boolean fields — the generated entity class', () => {
    it('types a boolean value-list field as boolean, not as the bare identifiers False | True', async () => {
        const src = await new EntitySubClassGeneratorBase().GenerateEntitySubClass(POOL, classifications(), false, true);
        expect(src).toContain('get IsTombstoned(): boolean | null {');
        expect(src).toContain('set IsTombstoned(value: boolean | null) {');
        expect(src).not.toMatch(/False \| True/);
    });

    it('a ListOrUserEntry boolean list is boolean too — no dangling literal in front of the open type', async () => {
        const src = await new EntitySubClassGeneratorBase().GenerateEntitySubClass(POOL, classifications(), false, true);
        expect(src).toContain('get IsInactive(): boolean {');
    });

    it('still documents the declared values on the boolean field', async () => {
        const src = await new EntitySubClassGeneratorBase().GenerateEntitySubClass(POOL, classifications(), false, true);
        const doc = src.slice(src.indexOf('* Field Name: IsTombstoned'), src.indexOf('get IsTombstoned()'));
        expect(doc).toContain('Value List Type: List');
        expect(doc).toMatch(/\* False/);
        expect(doc).toMatch(/\* True/);
    });

    it('every generated property type is one TypeScript can resolve (the build failed on TS2304 here)', async () => {
        const src = await new EntitySubClassGeneratorBase().GenerateEntitySubClass(POOL, classifications(), false, true);
        const types = [...src.matchAll(/^\s+get (\w+)\(\): (.+) \{$/gm)].map((m) => ({ field: m[1], type: m[2] }));
        expect(types.map((t) => t.field)).toEqual(expect.arrayContaining(['IsTombstoned', 'IsInactive', 'SyncStatus', 'Priority']));
        for (const t of types) {
            expect({ field: t.field, type: t.type, errors: typeErrors(t.type) }).toEqual({ field: t.field, type: t.type, errors: [] });
        }
    });

    it('control: string value lists still narrow to quoted literals, numeric ones to bare numbers', async () => {
        const src = await new EntitySubClassGeneratorBase().GenerateEntitySubClass(POOL, classifications(), false, true);
        expect(src).toContain("get SyncStatus(): 'Active' | 'Inactive' | null {");
        expect(src).toContain('get Priority(): 1 | 2 | null {');
    });
});

describe('value lists on boolean fields — the Zod schema', () => {
    it('validates a boolean value-list field with z.boolean(), not z.literal(False)', () => {
        const schema = new EntitySubClassGeneratorBase().GenerateSchemaAndType(classifications());
        expect(schema).toMatch(/IsTombstoned: z\.boolean\(\)\.nullable\(\)\.describe\(/);
        expect(schema).toMatch(/IsInactive: z\.boolean\(\)\.describe\(/);
        expect(schema).not.toMatch(/z\.literal\((False|True)\)/);
    });

    it('control: string and numeric value lists still become literal unions', () => {
        const schema = new EntitySubClassGeneratorBase().GenerateSchemaAndType(classifications());
        expect(schema).toContain("SyncStatus: z.union([z.literal('Active'), z.literal('Inactive')]).nullable()");
        expect(schema).toContain('Priority: z.union([z.literal(1), z.literal(2)]).nullable()');
    });
});
