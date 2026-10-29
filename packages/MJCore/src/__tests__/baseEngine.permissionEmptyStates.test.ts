import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig, PermissionConstrainedError } from '../generic/baseEngine';
import { UserInfo } from '../generic/securityInfo';
import { DatasetResultType, IMetadataProvider, RunViewResult } from '../generic/interfaces';
import { GetGlobalObjectStore } from '@memberjunction/global';

/**
 * The two ways a BaseEngine config ends up "loaded" while holding nothing because of a permission
 * answer:
 *
 *  - `CheckPermissionsOrSkipAll` — one unreadable entity skips every entity config, marks them
 *    loaded and permission-denied; getters throw PermissionConstrainedError.
 *  - `HandleSingleViewResult` — a failed load whose classifier says the user cannot read the entity
 *    is recorded as loaded-empty.
 *
 * Both are correct for a restricted user: the engine must not hang or retry-loop, and it schedules
 * nothing afterwards. (A bounded permission re-check was built and then removed at the owner's
 * request — permissions do not realistically change under a running engine, and Config(true)
 * re-evaluates them.)
 */

const USER = { ID: 'u1', Email: 'restricted@example.com' } as unknown as UserInfo;

class TestEngine extends BaseEngine<TestEngine> {
    public _alpha: unknown[] = [];
    public _beta: unknown[] = [];
    public _datasetMeta: Record<string, unknown[]> = { AlphaItems: [] };

    public async Config(): Promise<void> {
        // configs are injected directly
    }

    public Prepare(provider: IMetadataProvider, configs: BaseEnginePropertyConfig[]): void {
        // SetProvider is first-wins; tests bind their own provider directly.
        const internals = this as unknown as { _provider: IMetadataProvider; _metadataConfigs: BaseEnginePropertyConfig[]; _contextUser: UserInfo };
        internals._provider = provider;
        internals._metadataConfigs = configs;
        internals._contextUser = USER;
    }

    public SkipAllForTest(configs: BaseEnginePropertyConfig[]): BaseEnginePropertyConfig[] {
        return this.CheckPermissionsOrSkipAll(configs, USER);
    }

    public HandleResultForTest(config: BaseEnginePropertyConfig, result: RunViewResult): void {
        this.HandleSingleViewResult(config, result, USER);
    }

    public async LoadDatasetForTest(config: BaseEnginePropertyConfig): Promise<void> {
        await this.LoadSingleDatasetConfig(config, USER, false);
    }

    public Read(propertyName: string): unknown[] {
        return this.GetConfigData(propertyName);
    }

    public EntryFor(propertyName: string): { loadedSuccessfully: boolean; readDenied?: boolean; permissionDenied?: boolean } | undefined {
        return (this as unknown as { _dataMap: Map<string, { loadedSuccessfully: boolean; readDenied?: boolean; permissionDenied?: boolean }> })
            ._dataMap.get(propertyName);
    }
}

function failure(): RunViewResult {
    return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: 'boom', UserViewRunID: '' };
}

/** Provider whose read permission answer the test can flip. */
function makeProvider(state: { readable: boolean }): IMetadataProvider {
    return {
        CurrentUser: USER,
        EntityByName: vi.fn(() => ({ GetUserPermisions: () => ({ CanRead: state.readable }) })),
    } as unknown as IMetadataProvider;
}

const ALPHA = new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Alpha', PropertyName: '_alpha' });
const BETA = new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Beta', PropertyName: '_beta' });

describe('BaseEngine loaded-empty permission states', () => {
    let engine: TestEngine;
    let state: { readable: boolean };

    beforeEach(() => {
        vi.useFakeTimers();
        delete (GetGlobalObjectStore() as Record<string, unknown>)['___SINGLETON__TestEngine'];
        state = { readable: false };
        engine = new TestEngine();
        engine.Prepare(makeProvider(state), [ALPHA, BETA]);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('CheckPermissionsOrSkipAll', () => {
        it('skips every entity config, marks them loaded, makes getters throw, and schedules nothing', () => {
            expect(engine.SkipAllForTest([ALPHA, BETA])).toEqual([]);
            expect(vi.getTimerCount()).toBe(0);
            expect(engine.IsPermissionConstrained).toBe(true);
            expect(engine.EntryFor('_alpha')).toMatchObject({ loadedSuccessfully: true, permissionDenied: true });
            expect(() => engine.Read('_beta')).toThrow(PermissionConstrainedError);
        });

        it('passes the configs through untouched when everything is readable', () => {
            state.readable = true;
            expect(engine.SkipAllForTest([ALPHA, BETA])).toEqual([ALPHA, BETA]);
            expect(engine.IsPermissionConstrained).toBe(false);
            expect(vi.getTimerCount()).toBe(0);
        });

        it('skips all configs cleanly without permission-constraining when an entity schema is not installed in metadata', () => {
            const providerWithMissingSchema = {
                CurrentUser: USER,
                Entities: [{ Name: 'Alpha' }],
                EntityByName: vi.fn((name: string) =>
                    name === 'Alpha'
                        ? { GetUserPermisions: () => ({ CanRead: true }) }
                        : undefined
                ),
            } as unknown as IMetadataProvider;
            engine.Prepare(providerWithMissingSchema, [ALPHA, BETA]);

            expect(engine.SkipAllForTest([ALPHA, BETA])).toEqual([]);
            expect(engine.IsPermissionConstrained).toBe(false);
            expect(engine._alpha).toEqual([]);
            expect(engine._beta).toEqual([]);
            expect(engine.EntryFor('_alpha')).toMatchObject({ loadedSuccessfully: true });
            expect(engine.EntryFor('_alpha')?.permissionDenied).toBeUndefined();
            expect(engine.Read('_alpha')).toEqual([]);
            expect(engine.Read('_beta')).toEqual([]);
        });

    });

    describe('HandleSingleViewResult on a failed load', () => {
        it('loads a read-denied config empty, marks it loaded, and schedules nothing', () => {
            engine.HandleResultForTest(ALPHA, failure());
            expect(vi.getTimerCount()).toBe(0);
            expect(engine._alpha).toEqual([]);
            expect(engine.EntryFor('_alpha')).toMatchObject({ loadedSuccessfully: true, readDenied: true });
        });

        it('treats a failure as transient when the user can read the entity, and schedules no re-check', () => {
            state.readable = true;
            engine.HandleResultForTest(ALPHA, failure());
            expect(engine.EntryFor('_alpha')?.loadedSuccessfully).toBe(false);
            expect(vi.getTimerCount()).toBe(0);
        });

    });

    describe('Dataset configs under permission constraints (MJ#6106, MJ#5926)', () => {
        const DATASET_CONFIG = new BaseEnginePropertyConfig({
            Type: 'dataset',
            DatasetName: 'Template_Metadata',
            DatasetResultHandling: 'single_property',
            PropertyName: '_datasetMeta',
            Entities: ['MJ: Templates', 'MJ: Template Contents'],
        });

        it('CheckPermissionsOrSkipAll skips dataset configs with unreadable Entities and marks them permissionDenied', () => {
            expect(engine.SkipAllForTest([DATASET_CONFIG])).toEqual([]);
            expect(engine.IsPermissionConstrained).toBe(true);
            expect(engine.PermissionConstrainedEntities).toEqual(['MJ: Templates', 'MJ: Template Contents']);
            expect(engine.EntryFor('_datasetMeta')).toMatchObject({
                loadedSuccessfully: true,
                permissionDenied: true,
            });
            expect(engine._datasetMeta).toEqual({ AlphaItems: [] });
        });

        it('LoadSingleDatasetConfig classifies a permission-denied dataset result as loaded-empty (readDenied: true)', async () => {
            const deniedResult: DatasetResultType = {
                DatasetID: '',
                DatasetName: 'Template_Metadata',
                Success: false,
                Status: 'User restricted@example.com does not have read permissions on MJ: Templates',
                LatestUpdateDate: null as unknown as Date,
                Results: [],
            };
            const providerWithDataset = {
                ...makeProvider({ readable: false }),
                GetAndCacheDatasetByName: vi.fn().mockResolvedValue(deniedResult),
            } as unknown as IMetadataProvider;
            engine.Prepare(providerWithDataset, [DATASET_CONFIG]);

            await engine.LoadDatasetForTest(DATASET_CONFIG);

            expect(engine.EntryFor('_datasetMeta')).toMatchObject({
                loadedSuccessfully: true,
                readDenied: true,
            });
        });

        it('LoadSingleDatasetConfig leaves loadedSuccessfully=false for a transient dataset failure when user can read', async () => {
            const transientFailure: DatasetResultType = {
                DatasetID: '',
                DatasetName: 'Template_Metadata',
                Success: false,
                Status: 'Network connection reset',
                LatestUpdateDate: null as unknown as Date,
                Results: [],
            };
            const providerWithDataset = {
                ...makeProvider({ readable: true }),
                GetAndCacheDatasetByName: vi.fn().mockResolvedValue(transientFailure),
            } as unknown as IMetadataProvider;
            engine.Prepare(providerWithDataset, [DATASET_CONFIG]);

            await engine.LoadDatasetForTest(DATASET_CONFIG);

            expect(engine.EntryFor('_datasetMeta')?.loadedSuccessfully).toBe(false);
        });

        it('LoadSingleDatasetConfig classifies a server read refusal as loaded-empty for a dataset config with no Entities, by the Status text alone', async () => {
            // No `Entities` on the config and a provider that says the user CAN read, so the local
            // metadata check cannot classify the failure. Only the server's status message can.
            const unannotatedConfig = new BaseEnginePropertyConfig({
                Type: 'dataset',
                DatasetName: 'Template_Metadata',
                DatasetResultHandling: 'single_property',
                PropertyName: '_datasetMeta',
            });
            const serverRefusal: DatasetResultType = {
                DatasetID: '',
                DatasetName: 'Template_Metadata',
                Success: false,
                Status: 'User restricted@example.com does not have read permissions on MJ: Template Contents',
                LatestUpdateDate: null as unknown as Date,
                Results: [],
            };
            const providerWithDataset = {
                ...makeProvider({ readable: true }),
                GetAndCacheDatasetByName: vi.fn().mockResolvedValue(serverRefusal),
            } as unknown as IMetadataProvider;
            engine.Prepare(providerWithDataset, [unannotatedConfig]);

            await engine.LoadDatasetForTest(unannotatedConfig);

            expect(engine.EntryFor('_datasetMeta')).toMatchObject({
                loadedSuccessfully: true,
                readDenied: true,
            });
        });
    });
});
