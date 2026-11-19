/**
 * A dialect row saved or deleted on its own re-stamps its query's DefinitionFingerprint: a metadata
 * push writes a query's `relatedEntities` rows after the query, so the query's own stamp did not see
 * them. A row written while its query is mid-save is left to that save, which stamps last; a save
 * of the platform's dialect re-extracts the query instead, which stamps.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
    const state = {
        saveInProgress: false,
        rowSaves: true,
        platformDialectID: 'dialect-tsql',
        restamp: vi.fn(),
        rerun: vi.fn(),
        load: vi.fn(),
    };
    /** Stands in for the parent query: loads, re-stamps and re-extracts on cue. */
    class StubQuery {
        public SQL = 'SELECT 1';
        public Name = 'Members';
        public static IsSaveInProgress(): boolean { return state.saveInProgress; }
        public Load(id: string) { return state.load(id); }
        public RestampDefinitionFingerprintAsync() { return state.restamp(); }
        public RerunExtraction(...args: unknown[]) { return state.rerun(...args); }
    }
    return { state, StubQuery };
});
const state = h.state;

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    /** Stands in for a database provider: the platform and the parent query it loads. */
    class DatabaseProviderBase {
        public PlatformKey = 'sqlserver';
        public async GetEntityObject(): Promise<unknown> {
            return new h.StubQuery();
        }
    }
    return { ...actual, DatabaseProviderBase, LogError: vi.fn(), LogStatus: vi.fn() };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    /** Stands in for the generated base: plain fields and a Save/Delete that succeed or fail on cue. */
    class StubQuerySQL {
        public ID = 'variant-1';
        public QueryID = 'query-1';
        public SQLDialectID = 'dialect-pg';
        public SQL = 'SELECT 1';
        public ContextCurrentUser = { ID: 'user-1' };
        public ProviderToUse: unknown = null;
        public async Save(): Promise<boolean> { return h.state.rowSaves; }
        public async Delete(): Promise<boolean> { return h.state.rowSaves; }
    }
    const QueryEngine = {
        Instance: {
            Loaded: true,
            get SQLDialects() {
                return [{ ID: h.state.platformDialectID, PlatformKey: 'sqlserver' }, { ID: 'dialect-pg', PlatformKey: 'postgresql' }];
            },
        },
    };
    return { ...actual, MJQuerySQLEntity: StubQuerySQL, QueryEngine };
});

vi.mock('../custom/MJQueryEntityServer.server', () => ({ MJQueryEntityServer: h.StubQuery }));

import { DatabaseProviderBase } from '@memberjunction/core';
import { MJQuerySQLEntityServer } from '../custom/MJQuerySQLEntityServer.server';

function row(dialectID = 'dialect-pg'): MJQuerySQLEntityServer {
    const r = new MJQuerySQLEntityServer();
    Object.assign(r, { SQLDialectID: dialectID, ProviderToUse: new (DatabaseProviderBase as unknown as new () => object)() });
    return r;
}

beforeEach(() => {
    vi.clearAllMocks();
    state.saveInProgress = false;
    state.rowSaves = true;
    state.load.mockResolvedValue(true);
});

describe('MJQuerySQLEntityServer — the parent fingerprint', () => {
    it("re-stamps the parent after saving another platform's dialect row", async () => {
        expect(await row().Save()).toBe(true);

        expect(state.load).toHaveBeenCalledWith('query-1');
        expect(state.restamp).toHaveBeenCalledTimes(1);
        expect(state.rerun).not.toHaveBeenCalled();
    });

    it("re-extracts the parent after saving the platform's dialect row, which stamps, and does not stamp again", async () => {
        await row(state.platformDialectID).Save();

        expect(state.rerun).toHaveBeenCalledTimes(1);
        expect(state.restamp).not.toHaveBeenCalled();
    });

    it("leaves the stamp to the parent's save when the row is written during it", async () => {
        state.saveInProgress = true;

        await row().Save();

        expect(state.load).not.toHaveBeenCalled();
        expect(state.restamp).not.toHaveBeenCalled();
    });

    it('re-stamps the parent after deleting a dialect row, and not after a failed delete', async () => {
        expect(await row().Delete()).toBe(true);
        expect(state.restamp).toHaveBeenCalledTimes(1);

        state.rowSaves = false;
        expect(await row().Delete()).toBe(false);
        expect(state.restamp).toHaveBeenCalledTimes(1);
    });

    it('does nothing to the parent when the row did not save', async () => {
        state.rowSaves = false;

        expect(await row().Save()).toBe(false);

        expect(state.restamp).not.toHaveBeenCalled();
        expect(state.rerun).not.toHaveBeenCalled();
    });

    it('keeps the row saved when the parent cannot be loaded', async () => {
        state.load.mockResolvedValue(false);

        expect(await row().Save()).toBe(true);
        expect(state.restamp).not.toHaveBeenCalled();
    });
});
