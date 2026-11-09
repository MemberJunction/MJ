/**
 * Tests for the development-time freeze of the metadata graph that per-request providers share
 * with the global provider (#3095). The graph is frozen the first time a provider adopts it as a
 * shared shell, when `MJ_FREEZE_METADATA` is on or, unset, when `NODE_ENV` is not `production`.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Metadata } from '../generic/metadata';
import { IMetadataProvider, ProviderConfigDataBase } from '../generic/interfaces';
import { EntityFieldInfo, EntityFieldTSType, EntityInfo, EntityRelationshipInfo } from '../generic/entityInfo';
import { RowLevelSecurityFilterInfo, UserInfo } from '../generic/securityInfo';
import { QueryInfo } from '../generic/queryInfo';
import { LibraryInfo } from '../generic/libraryInfo';
import { BaseInfo, DeepFreezeInfoValue } from '../generic/baseInfo';
import { FreezeSharedMetadata, IsMetadataFreezeEnabled, IsMetadataSnapshotFrozen } from '../generic/metadataFreeze';
import { AllMetadataArrays } from '../generic/providerBase';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

function freshConfig(): ProviderConfigDataBase {
    return new ProviderConfigDataBase({}, '__mj', [], [], true);
}

function reuseGlobalConfig(): ProviderConfigDataBase {
    return new ProviderConfigDataBase({}, '__mj', [], [], false);
}

/** Runs `write` in strict mode, as compiled TypeScript modules do, so a blocked write throws. */
function strictWrite(write: () => void): () => void {
    return () => {
        'use strict';
        write();
    };
}

describe('IsMetadataFreezeEnabled', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    test('unset, it follows NODE_ENV: on outside production, off in production', () => {
        vi.stubEnv('MJ_FREEZE_METADATA', '');
        vi.stubEnv('NODE_ENV', 'development');
        expect(IsMetadataFreezeEnabled()).toBe(true);
        vi.stubEnv('NODE_ENV', 'production');
        expect(IsMetadataFreezeEnabled()).toBe(false);
    });

    test('MJ_FREEZE_METADATA overrides NODE_ENV in both directions', () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('MJ_FREEZE_METADATA', 'true');
        expect(IsMetadataFreezeEnabled()).toBe(true);
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('MJ_FREEZE_METADATA', ' OFF ');
        expect(IsMetadataFreezeEnabled()).toBe(false);
    });

    test('an unrecognized value falls back to NODE_ENV', () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('MJ_FREEZE_METADATA', 'maybe');
        expect(IsMetadataFreezeEnabled()).toBe(false);
    });
});

describe('shared metadata freeze (#3095)', () => {
    let previousGlobalProvider: IMetadataProvider;
    let globalProvider: TestMetadataProvider;

    beforeEach(async () => {
        vi.stubEnv('MJ_FREEZE_METADATA', 'true');
        previousGlobalProvider = Metadata.Provider;
        globalProvider = new TestMetadataProvider();
        await globalProvider.Config(freshConfig());
        Metadata.Provider = globalProvider;
    });

    afterEach(() => {
        Metadata.Provider = previousGlobalProvider;
        vi.unstubAllEnvs();
    });

    async function shareGlobalGraph(): Promise<TestMetadataProvider> {
        const perRequestProvider = new TestMetadataProvider();
        await perRequestProvider.Config(reuseGlobalConfig());
        return perRequestProvider;
    }

    test('the global graph is not frozen until a provider shares it', async () => {
        expect(IsMetadataSnapshotFrozen(globalProvider.AllMetadata)).toBe(false);
        await shareGlobalGraph();
        expect(IsMetadataSnapshotFrozen(globalProvider.AllMetadata)).toBe(true);
    });

    test('writing an EntityInfo or EntityFieldInfo property throws once shared', async () => {
        const perRequestProvider = await shareGlobalGraph();
        const entity: EntityInfo = perRequestProvider.Entities[0];
        const field: EntityFieldInfo = entity.Fields[0];

        expect(strictWrite(() => { entity.Name = 'Changed'; })).toThrow(TypeError);
        expect(strictWrite(() => { field.DisplayName = 'Changed'; })).toThrow(TypeError);
        expect(globalProvider.Entities[0].Name).not.toBe('Changed');
    });

    test('pushing to, sorting or splicing a shared array throws', async () => {
        const perRequestProvider = await shareGlobalGraph();
        const entity = perRequestProvider.Entities[0];

        expect(strictWrite(() => { entity.Fields.push(new EntityFieldInfo()); })).toThrow(TypeError);
        expect(strictWrite(() => { entity.Fields.sort((a, b) => b.Sequence - a.Sequence); })).toThrow(TypeError);
        expect(strictWrite(() => { perRequestProvider.Entities.splice(0, 1); })).toThrow(TypeError);
        expect(globalProvider.Entities.length).toBeGreaterThan(0);
    });

    test('memoized getters still compute and cache after the freeze', async () => {
        const perRequestProvider = await shareGlobalGraph();
        const entity = perRequestProvider.Entities[0];

        const primaryKeys = entity.PrimaryKeys;
        expect(primaryKeys.map(f => f.Name)).toEqual(['ID']);
        expect(entity.PrimaryKeys).toBe(primaryKeys);
        expect(entity.FirstPrimaryKey?.Name).toBe('ID');
        expect(entity.FieldByName('name')?.Name).toBe('Name');
        expect(entity.Fields[0].TSType).toBe(EntityFieldTSType.String);
        expect(entity.Fields[1].CodeName).toBe('Name');
        expect(entity.NameField?.Name).toBe('Name');
    });

    test('each per-request shell still gets its own CurrentUser', async () => {
        const perRequestProvider = await shareGlobalGraph();
        const user = new UserInfo();
        user.ID = 'per-request-user';
        perRequestProvider.AllMetadata.CurrentUser = user;
        expect(perRequestProvider.CurrentUser).toBe(user);
        expect(globalProvider.CurrentUser).not.toBe(user);
    });

    test('a refresh produces a new graph that is frozen when it is shared', async () => {
        await shareGlobalGraph();
        const firstSnapshot = globalProvider.AllMetadata;

        await globalProvider.Refresh();
        const secondSnapshot = globalProvider.AllMetadata;
        expect(secondSnapshot).not.toBe(firstSnapshot);
        expect(IsMetadataSnapshotFrozen(secondSnapshot)).toBe(false);

        const nextRequestProvider = await shareGlobalGraph();
        expect(IsMetadataSnapshotFrozen(secondSnapshot)).toBe(true);
        expect(strictWrite(() => { nextRequestProvider.Entities[0].Name = 'Changed'; })).toThrow(TypeError);
    });

    test('with the flag off, a shared graph stays writable', async () => {
        vi.stubEnv('MJ_FREEZE_METADATA', 'false');
        const perRequestProvider = await shareGlobalGraph();
        expect(IsMetadataSnapshotFrozen(globalProvider.AllMetadata)).toBe(false);
        expect(Object.isFrozen(perRequestProvider.Entities)).toBe(false);
    });

    test('freezing again is a no-op and leaves the snapshot object itself extensible', async () => {
        await shareGlobalGraph();
        const snapshot = globalProvider.AllMetadata;
        FreezeSharedMetadata(snapshot, AllMetadataArrays.map(m => m.key));
        expect(Object.isFrozen(snapshot)).toBe(false);
        expect(Object.isFrozen(snapshot.AllEntities)).toBe(true);
    });
});

/** Whether an error is the TypeError a write to a frozen object raises. */
function isFrozenWriteError(e: unknown): boolean {
    return e instanceof TypeError && /read[ -]only|not extensible|Cannot assign|Cannot add property|Cannot delete|frozen/i.test(e.message);
}

/** Reads every getter on an Info object's prototype chain; returns the getters that hit a frozen write. */
function gettersThatWriteFrozenState(info: BaseInfo): string[] {
    const failures: string[] = [];
    const seen = new Set<string>();
    let proto: object | null = Object.getPrototypeOf(info);
    while (proto && proto !== Object.prototype) {
        for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(proto))) {
            if (seen.has(name) || typeof descriptor.get !== 'function' || name.startsWith('_')) {
                continue;
            }
            seen.add(name);
            for (let pass = 0; pass < 2; pass++) { // a second read takes the cached path
                try {
                    descriptor.get.call(info);
                }
                catch (e) {
                    if (isFrozenWriteError(e)) {
                        failures.push(`${info.constructor.name}.${name}: ${(e as Error).message}`);
                    }
                }
            }
        }
        proto = Object.getPrototypeOf(proto);
    }
    return failures;
}

function buildEntity(): EntityInfo {
    const fields = [
        { ID: 'f-id', EntityID: 'e-1', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
        { ID: 'f-name', EntityID: 'e-1', Name: 'Name', Type: 'nvarchar', Length: 200, Sequence: 2, IsNameField: true,
          ValueListType: 'List', DefaultValue: "('Draft')", EntityFieldValues: [{ ID: 'v1', EntityFieldID: 'f-name', Value: 'Draft', Sequence: 1 }] },
        { ID: 'f-created', EntityID: 'e-1', Name: '__mj_CreatedAt', Type: 'datetimeoffset', Sequence: 3 },
        { ID: 'f-parent', EntityID: 'e-1', Name: 'ParentID', Type: 'uniqueidentifier', Sequence: 4, RelatedEntityID: 'e-1',
          RelatedEntityJoinFields: '{"mode":"extend","fields":[{"field":"Name"}]}', Configuration: '{}' },
    ];
    return new EntityInfo({
        ID: 'e-1', Name: 'Widgets', SchemaName: 'dbo', BaseTable: 'Widget', BaseView: 'vwWidgets',
        Configuration: '{}', SubtypeSelector: '{"Path":"Kind"}', EntityFields: fields,
        EntityRelationships: [{ ID: 'r-1', EntityID: 'e-1', RelatedEntityID: 'e-1', RelatedEntity: 'Widgets', RelatedEntityJoinField: 'ParentID', Configuration: '{}' }],
    });
}

describe('frozen Info objects keep their memoizing getters working', () => {
    test('no getter of a frozen entity, field or relationship writes frozen state', () => {
        const entity = buildEntity();
        DeepFreezeInfoValue([entity]);
        expect(Object.isFrozen(entity)).toBe(true);
        expect(Object.isFrozen(entity.Fields[0])).toBe(true);

        const failures = [
            ...gettersThatWriteFrozenState(entity),
            ...entity.Fields.flatMap(f => gettersThatWriteFrozenState(f)),
            ...entity.RelatedEntities.flatMap(r => gettersThatWriteFrozenState(r)),
        ];
        expect(failures).toEqual([]);
    });

    test('no getter of a frozen query, RLS filter or library writes frozen state', () => {
        const query = new QueryInfo({ ID: 'q-1', Name: 'Q', Configuration: '{"Priority":5}', PlatformVariants: null });
        const filter = new RowLevelSecurityFilterInfo({ ID: 'rls-1', Name: 'F', FilterText: "Status='A'" });
        const library = new LibraryInfo({ ID: 'l-1', Name: 'L', ExportedItems: 'a, b' });
        DeepFreezeInfoValue([query, filter, library]);

        expect([
            ...gettersThatWriteFrozenState(query),
            ...gettersThatWriteFrozenState(filter),
            ...gettersThatWriteFrozenState(library),
        ]).toEqual([]);
    });

    test('a value cached after the freeze is frozen too', () => {
        const entity = buildEntity();
        DeepFreezeInfoValue([entity]);
        const primaryKeys = entity.PrimaryKeys;
        expect(primaryKeys.map(f => f.Name)).toEqual(['ID']);
        expect(Object.isFrozen(primaryKeys)).toBe(true);
        expect(entity.PrimaryKeys).toBe(primaryKeys);
    });

    test('a frozen entity serializes to the same JSON as an unfrozen one', () => {
        const unfrozen = buildEntity();
        const frozen = buildEntity();
        // Warm some caches first so the freeze has memo values to move.
        void frozen.PrimaryKeys;
        void frozen.Fields[1].CodeName;
        DeepFreezeInfoValue([frozen]);
        expect(JSON.parse(JSON.stringify(frozen))).toEqual(JSON.parse(JSON.stringify(unfrozen)));
    });

    test('an unfrozen object caches as before, and its cached values stay mutable', () => {
        const entity = buildEntity();
        const keys = entity.PrimaryKeys;
        expect(entity.PrimaryKeys).toBe(keys);
        expect(Object.isFrozen(keys)).toBe(false);
        expect(Object.isFrozen(entity)).toBe(false);
    });

    test('an Info object built from another one gets its own caches, not the source\'s', () => {
        const source = buildEntity();
        void source.FieldByName('Name'); // fill the source's field map
        const copy = new EntityInfo(source);
        expect(copy.FieldByName('Name')).toBe(copy.Fields[1]);
        expect(copy.FieldByName('Name')).not.toBe(source.Fields[1]);
    });
});
