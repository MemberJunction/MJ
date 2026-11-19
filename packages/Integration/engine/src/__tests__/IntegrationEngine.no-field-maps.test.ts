/**
 * A pull entity map with NO active field maps is skipped before anything is fetched for it.
 *
 * Such a map cannot write a single column. A soft-key table refuses every record it is handed
 * (`KEYLESS_RECORD_REFUSED`: the key is simply the first field the engine finds unmapped), and any
 * other table gets rows with nothing in them. The engine used to fetch the object in full anyway.
 * Observed on a per-connection NetForum catalog: 292 maps were created with no field maps by the
 * post-restart apply, and the first sync that reached them fetched and refused 307,843 records
 * until the refusals ran the API out of heap.
 *
 * These drive the real `processPullSync` on a prototype host with only its collaborators stubbed.
 * The connector is a Proxy that records every property read, so "no fetch" means the connector was
 * not touched at all, not just that `FetchChanges` was not called.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView, type UserInfo } from '@memberjunction/core';
import { IntegrationEngine } from '../IntegrationEngine.js';
import { SyncLogger } from '../SyncLogger.js';
import type { SyncResult } from '../types.js';

const USER = { ID: 'user-1' } as UserInfo;

interface FieldMapStub {
    SourceFieldName: string;
    DestinationFieldName: string;
    Direction: string;
    IsKeyField: boolean;
}

type PullHost = {
    processPullSync: (...args: unknown[]) => Promise<SyncResult>;
    mergeResult: (aggregate: SyncResult, mapResult: SyncResult) => void;
    loadFieldMaps: (entityMapID: string, user: UserInfo) => Promise<FieldMapStub[]>;
};

/** Stops the method at the first collaborator a test did not expect it to reach. */
class StopError extends Error {}

function makeHost(fieldMaps: FieldMapStub[]) {
    const connectorTouched: string[] = [];
    const connector = new Proxy({}, {
        get(_target, prop) {
            connectorTouched.push(String(prop));
            throw new StopError(`connector.${String(prop)} reached`);
        },
    });
    const watermarkLoad = vi.fn(async () => { throw new StopError('watermark read'); });
    const host = Object.create(IntegrationEngine.prototype) as unknown as PullHost & Record<string, unknown>;
    Object.assign(host, {
        loadFieldMaps: vi.fn(async () => fieldMaps),
        ResolveExcludedSourceNames: () => new Set<string>(),
        runWriteForMap: async <T>(_id: string, fn: () => Promise<T>) => fn(),
        watermarkService: { Load: watermarkLoad },
        warnOnUnbindableFieldMaps: () => undefined,
    });
    const logger = new SyncLogger({ CiId: 'ci-1', Integration: 'NetForum' });
    const warning = vi.spyOn(logger, 'Warning');
    const emit = vi.spyOn(logger, 'Emit');
    const config = { companyIntegration: { ID: 'ci-1', IntegrationID: 'int-1' }, connector, fullSync: false };
    const entityMap = { ID: 'em-1', ExternalObjectName: 'ChapterAddress', Entity: 'Chapter Addresses' };
    const run = { ID: 'run-1' };
    const call = () => host.processPullSync(config, entityMap, run, USER, 0, 1, undefined, undefined, logger);
    return { host, call, connectorTouched, watermarkLoad, warning, emit };
}

const oneFieldMap: FieldMapStub = { SourceFieldName: 'cxa_key', DestinationFieldName: 'cxa_key', Direction: 'SourceToDest', IsKeyField: true };

describe('processPullSync: a map with no active field maps', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('returns before touching the connector or the watermark', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const h = makeHost([]);

        await h.call();

        expect(h.connectorTouched).toEqual([]);
        expect(h.watermarkLoad).not.toHaveBeenCalled();
    });

    it('records one Critical CONFIGURATION_ERROR that names the object and the cause', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const result = await makeHost([]).call();

        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0]).toMatchObject({ ErrorCode: 'CONFIGURATION_ERROR', Severity: 'Critical', ChangeType: 'Skip' });
        expect(result.Errors[0].ErrorMessage).toMatch(/'ChapterAddress' has no active field maps/);
    });

    it('marks the object incomplete and counts no records', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const result = await makeHost([]).call();

        expect(result.IncompleteObjects).toEqual(['ChapterAddress']);
        expect(result).toMatchObject({
            RecordsProcessed: 0, RecordsCreated: 0, RecordsUpdated: 0,
            RecordsDeleted: 0, RecordsErrored: 0, RecordsSkipped: 0,
        });
    });

    it('emits ENTITY_MAP_HAS_NO_FIELD_MAPS and the skipped lifecycle event', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const h = makeHost([]);

        await h.call();

        expect(h.warning).toHaveBeenCalledWith(
            'ChapterAddress', 'ENTITY_MAP_HAS_NO_FIELD_MAPS', expect.stringMatching(/no active field maps/), { entityMapID: 'em-1' },
        );
        expect(h.emit).toHaveBeenCalledWith('sync.entity-map.skipped', expect.objectContaining({
            externalObjectName: 'ChapterAddress', skippedReason: 'ENTITY_MAP_HAS_NO_FIELD_MAPS',
        }));
    });

    it('reaches the run aggregate the ErrorLog and the incomplete list are written from', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const h = makeHost([]);
        const skip = await h.call();
        const aggregate: SyncResult = {
            Success: true, RecordsProcessed: 0, RecordsCreated: 0, RecordsUpdated: 0,
            RecordsDeleted: 0, RecordsErrored: 0, RecordsSkipped: 0, Errors: [],
        };

        h.host.mergeResult(aggregate, skip);

        expect(aggregate.Errors.map(e => e.ErrorCode)).toEqual(['CONFIGURATION_ERROR']);
        expect(aggregate.IncompleteObjects).toEqual(['ChapterAddress']);
    });
});

describe('processPullSync: a map with field maps', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('goes past the guard toward the fetch, with no skip warning', async () => {
        const h = makeHost([oneFieldMap]);

        await expect(h.call()).rejects.toBeInstanceOf(StopError);

        expect(h.watermarkLoad).toHaveBeenCalledOnce();
        expect(h.warning).not.toHaveBeenCalledWith('ChapterAddress', 'ENTITY_MAP_HAS_NO_FIELD_MAPS', expect.anything(), expect.anything());
    });
});

describe('loadFieldMaps', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    const realLoad = (): PullHost['loadFieldMaps'] => {
        const host = Object.create(IntegrationEngine.prototype) as unknown as PullHost;
        return host.loadFieldMaps.bind(host);
    };

    it('returns the active field maps it read', async () => {
        vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(
            { Success: true, Results: [oneFieldMap] } as unknown as Awaited<ReturnType<RunView['RunView']>>,
        );
        expect(await realLoad()('em-1', USER)).toEqual([oneFieldMap]);
    });

    it('THROWS on a failed read, so the map fails as unreadable instead of being skipped as unmapped', async () => {
        vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(
            { Success: false, ErrorMessage: 'connection reset', Results: [] } as unknown as Awaited<ReturnType<RunView['RunView']>>,
        );
        await expect(realLoad()('em-1', USER)).rejects.toThrow(/FIELD_MAPS_UNREADABLE.*em-1.*connection reset/);
    });
});
