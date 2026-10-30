import { describe, expect, it, vi } from 'vitest';
import type { EntityInfo, IMetadataProvider, RunViewResult, UserInfo } from '@memberjunction/core';
import { SyncEngine } from '../lib/sync-engine';

interface FakeFieldSpec {
    Name: string;
    Type: string;
    NeedsQuotes: boolean;
}

function buildEntityInfo(name: string, fields: FakeFieldSpec[], pkNames: string[] = ['ID']): EntityInfo {
    const pks = pkNames.map((k) => ({ Name: k }));
    const partial: Partial<EntityInfo> = {
        Name: name,
        SchemaName: '__mj',
        BaseTable: 'FakeTable',
        PrimaryKeys: pks as EntityInfo['PrimaryKeys'],
        FirstPrimaryKey: pks[0] as EntityInfo['FirstPrimaryKey'],
        Fields: fields.map((f) => ({
            Name: f.Name,
            Type: f.Type,
            NeedsQuotes: f.NeedsQuotes,
            IsVirtual: false,
        })) as EntityInfo['Fields'],
    };
    return partial as EntityInfo;
}

function createFakeRunViewProvider(
    spy: ReturnType<typeof vi.fn>,
): IMetadataProvider {
    const partial = {
        RunView: spy,
    };
    return partial as Partial<IMetadataProvider> as IMetadataProvider;
}

describe('MetadataSync SQL filter literal validation (PR #6034)', () => {
    const numericPkEntity = buildEntityInfo(
        'Test: NumericItems',
        [
            { Name: 'ID', Type: 'int', NeedsQuotes: false },
            { Name: 'Sequence', Type: 'int', NeedsQuotes: false },
            { Name: 'IsActive', Type: 'bit', NeedsQuotes: false },
            { Name: 'Code', Type: 'nvarchar', NeedsQuotes: true },
        ],
        ['ID'],
    );

    const stringPkEntity = buildEntityInfo(
        'Test: StringItems',
        [{ Name: 'Code', Type: 'nvarchar', NeedsQuotes: true }],
        ['Code'],
    );

    describe('SyncEngine.ResolveLookup unquoted field validation', () => {
        it('rejects SQL injection payloads on unquoted numeric/boolean lookup fields before calling RunView', async () => {
            const runViewSpy = vi.fn();
            const provider = createFakeRunViewProvider(runViewSpy);
            const engine = new SyncEngine({} as UserInfo);
            Reflect.set(engine, 'metadata', {
                EntityByName: (n: string) => (n === numericPkEntity.Name ? numericPkEntity : undefined),
            });

            await expect(
                engine.ResolveLookup(
                    numericPkEntity.Name,
                    [{ fieldName: 'Sequence', fieldValue: '1 OR 1=1' }],
                    false,
                    {},
                    undefined,
                    false,
                    undefined,
                    provider,
                ),
            ).rejects.toThrow(/must be a numeric or boolean literal/);

            await expect(
                engine.ResolveLookup(
                    numericPkEntity.Name,
                    [{ fieldName: 'IsActive', fieldValue: '1; DROP TABLE FakeTable--' }],
                    false,
                    {},
                    undefined,
                    false,
                    undefined,
                    provider,
                ),
            ).rejects.toThrow(/must be a numeric or boolean literal/);

            expect(runViewSpy).not.toHaveBeenCalled();
        });

        it('accepts valid numeric and boolean lookup literals and builds clean ExtraFilter predicates', async () => {
            const emptySuccess: Partial<RunViewResult> = {
                Success: true,
                Results: [{ ID: 99 }],
            };
            const runViewSpy = vi.fn().mockResolvedValue(emptySuccess);
            const provider = createFakeRunViewProvider(runViewSpy);
            const engine = new SyncEngine({} as UserInfo);
            Reflect.set(engine, 'metadata', {
                EntityByName: (n: string) => (n === numericPkEntity.Name ? numericPkEntity : undefined),
            });

            const resolved = await engine.ResolveLookup(
                numericPkEntity.Name,
                [
                    { fieldName: 'Sequence', fieldValue: ' -42.5 ' },
                    { fieldName: 'IsActive', fieldValue: 'true' },
                ],
                false,
                {},
                undefined,
                false,
                undefined,
                provider,
            );

            expect(resolved).toBe(99);
            expect(runViewSpy).toHaveBeenCalledTimes(1);
            const params = runViewSpy.mock.calls[0][0] as { ExtraFilter: string };
            expect(params.ExtraFilter).toBe('Sequence = -42.5 AND IsActive = true');
        });
    });

    describe('SyncEngine.loadFromDatabase primary key validation', () => {
        type LoadFromDbFn = (
            entityName: string,
            entityInfo: EntityInfo,
            primaryKey: Record<string, string | number | boolean | string[] | Record<string, number>>,
            recordProvider: IMetadataProvider | undefined,
            cacheResult: boolean,
        ) => Promise<null>;

        it('rejects SQL injection strings, non-finite numbers, arrays, and objects for unquoted primary keys', async () => {
            const runViewSpy = vi.fn();
            const provider = createFakeRunViewProvider(runViewSpy);
            const engine = new SyncEngine({} as UserInfo);
            const loadFromDatabase = Reflect.get(engine, 'loadFromDatabase') as LoadFromDbFn;

            await expect(
                loadFromDatabase.call(engine, numericPkEntity.Name, numericPkEntity, { ID: '1 OR 1=1' }, provider, false),
            ).rejects.toThrow(/must be a numeric or boolean literal/);

            await expect(
                loadFromDatabase.call(engine, numericPkEntity.Name, numericPkEntity, { ID: ['1 OR 1=1'] }, provider, false),
            ).rejects.toThrow(/must be a string, finite number, or boolean primitive/);

            await expect(
                loadFromDatabase.call(engine, numericPkEntity.Name, numericPkEntity, { ID: Number.NaN }, provider, false),
            ).rejects.toThrow(/must be a string, finite number, or boolean primitive/);

            await expect(
                loadFromDatabase.call(engine, numericPkEntity.Name, numericPkEntity, { ID: { bad: 1 } }, provider, false),
            ).rejects.toThrow(/must be a string, finite number, or boolean primitive/);

            expect(runViewSpy).not.toHaveBeenCalled();
        });

        it('rejects non-primitive array/object values for quoted primary keys and escapes single quotes on strings', async () => {
            const runViewSpy = vi.fn().mockResolvedValue({ Success: true, Results: [] });
            const provider = createFakeRunViewProvider(runViewSpy);
            const engine = new SyncEngine({} as UserInfo);
            const loadFromDatabase = Reflect.get(engine, 'loadFromDatabase') as LoadFromDbFn;

            await expect(
                loadFromDatabase.call(
                    engine,
                    stringPkEntity.Name,
                    stringPkEntity,
                    { Code: ["abc' OR '1'='1"] },
                    provider,
                    false,
                ),
            ).rejects.toThrow(/must be a string, finite number, or boolean primitive/);
            expect(runViewSpy).not.toHaveBeenCalled();

            const result = await loadFromDatabase.call(
                engine,
                stringPkEntity.Name,
                stringPkEntity,
                { Code: "O'Brien' OR '1'='1" },
                provider,
                false,
            );
            expect(result).toBeNull();
            expect(runViewSpy).toHaveBeenCalledTimes(1);
            const params = runViewSpy.mock.calls[0][0] as { ExtraFilter: string };
            expect(params.ExtraFilter).toBe("Code = 'O''Brien'' OR ''1''=''1'");
        });
    });
});
