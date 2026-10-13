/**
 * Tests for CheckSchemaSharedByOtherApps (B14/B20 follow-up).
 *
 * RemoveApp must distinguish a definitively-shared schema (skip the metadata + schema drop, then
 * proceed) from an INDETERMINATE one (the share-check query itself failed). The latter must NOT
 * silently skip-and-strip — doing so leaves a half-removed app (files gone, schema + metadata
 * intact, status Removed). The function reports `CheckFailed:true` on query failure so the caller
 * can fold it into removalErrors and abort BEFORE touching the filesystem.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let runViewResult: { Success: boolean; Results: unknown[]; ErrorMessage?: string } = { Success: true, Results: [] };
let lastExtraFilter: string | undefined;

vi.mock('@memberjunction/core', () => ({
    Metadata: class {},
    CompositeKey: class {},
    RunView: class {
        async RunView(params: { ExtraFilter?: string }) {
            lastExtraFilter = params.ExtraFilter;
            return runViewResult;
        }
    },
}));

import { CheckSchemaSharedByOtherApps } from '../install/history-recorder.js';

const user = {} as never;

beforeEach(() => {
    vi.clearAllMocks();
    runViewResult = { Success: true, Results: [] };
    lastExtraFilter = undefined;
});

describe('CheckSchemaSharedByOtherApps', () => {
    it('no other app uses the schema → not shared, check succeeded', async () => {
        runViewResult = { Success: true, Results: [] };
        const r = await CheckSchemaSharedByOtherApps(user, 'app_schema', 'app-1');
        expect(r).toEqual({ Shared: false, CheckFailed: false });
    });

    it('another app uses the schema → shared, check succeeded (drop is skipped, NOT aborted)', async () => {
        runViewResult = { Success: true, Results: [{ ID: 'other-app' }] };
        const r = await CheckSchemaSharedByOtherApps(user, 'app_schema', 'app-1');
        expect(r).toEqual({ Shared: true, CheckFailed: false });
    });

    it('empty schema name → not shared, no query', async () => {
        const r = await CheckSchemaSharedByOtherApps(user, '', 'app-1');
        expect(r).toEqual({ Shared: false, CheckFailed: false });
    });

    it('share-check QUERY fails → CheckFailed so the caller ABORTS (not skip-and-strip)', async () => {
        runViewResult = { Success: false, Results: [], ErrorMessage: 'db down' };
        const r = await CheckSchemaSharedByOtherApps(user, 'app_schema', 'app-1');
        // Shared:true keeps the safe direction (never drop a possibly-shared schema);
        // CheckFailed:true is the new signal that forces the remove to abort.
        expect(r.Shared).toBe(true);
        expect(r.CheckFailed).toBe(true);
        expect(r.ErrorMessage).toContain('db down');
    });

    it('first install (no app row yet, excludeAppId empty) → no ID exclusion in the filter', async () => {
        // A fresh install that adopts an existing schema has no MJ: Open Apps row, so the caller
        // passes ''. `ID <> ''` against a uniqueidentifier column fails on SQL Server ("Conversion
        // failed when converting from a character string to uniqueidentifier"), which turned every
        // such check into CheckFailed and hid a real co-tenant.
        await CheckSchemaSharedByOtherApps(user, 'app_schema', '');
        expect(lastExtraFilter).toBeDefined();
        expect(lastExtraFilter).toContain("LOWER('app_schema')");
        expect(lastExtraFilter).not.toMatch(/\bID\s*<>/);
    });

    it('excludes this app by ID when it has one', async () => {
        await CheckSchemaSharedByOtherApps(user, 'app_schema', 'app-1');
        expect(lastExtraFilter).toContain("ID <> 'app-1'");
    });
});
