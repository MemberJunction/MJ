/**
 * MJ #4050 — CodeGen must prune EntityField rows orphaned by its OWN base-view regeneration.
 *
 * The failure this pins:
 *
 * Step 2 of `manageSQLScriptsAndExecution` regenerates the base view of EVERY included entity on
 * every run, so a view can LOSE columns without the entity's TABLE changing (the 6.1 hierarchy
 * opt-in gate #3939 does exactly this — `Root*`/`Depth`/`Path` disappear from the view). The
 * virtual `EntityField` rows for those columns survive, so the declared field count no longer
 * matches the view, and every save on the entity fails with Msg 213.
 *
 * The prune that would fix it (`spDeleteUnneededEntityFields`) is deferred by Pass 1 and, in Pass 2,
 * is scoped to `newEntityList ∪ modifiedEntityList`. Both lists are populated from TABLE-schema
 * changes only, so a view-only shrink puts the entity in NEITHER — and an empty filter fast-exits
 * Pass 2 entirely. The run that creates the orphans is therefore structurally unable to see them,
 * and so is every later run. Only `mj migrate` (via R__RefreshMetadata's unscoped prune) heals it.
 *
 * The invariant these tests lock in: whenever Pass 2 is asked to prune, the prune RUNS and runs
 * UNSCOPED — because the entity that needs pruning is, by definition, the one not in the filter.
 * The rest of Pass 2 stays scoped; only the prune (a single SP call) goes wide.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// `additionalSchemaInfo` unset keeps `manageEntityFields` off its metadata-refresh branch, which
// needs a live provider. Everything else this method reads from config is stubbed downstream.
vi.mock('mssql', () => ({}));
vi.mock('../Config/config', () => ({
    configInfo: {},
    currentWorkingDirectory: '/tmp',
    getSettingValue: vi.fn(),
    mj_core_schema: () => '__mj',
    dbPlatform: () => 'sqlserver',
    outputDir: '/tmp',
}));
vi.mock('../Misc/status_logging', () => ({
    logError: vi.fn(),
    logMessage: vi.fn(),
    logStatus: vi.fn(),
    logWarning: vi.fn(),
    startSpinner: vi.fn(),
    succeedSpinner: vi.fn(),
    failSpinner: vi.fn(),
    warnSpinner: vi.fn(),
    logIf: vi.fn(),
}));

import { ManageMetadataBase } from '../Database/manage-metadata';
import type { CodeGenConnection } from '../Database/codeGenDatabaseProvider';
import type { CodeGenDatabaseProvider } from '../Database/codeGenDatabaseProvider';
import type { UserInfo } from '@memberjunction/core';

const FAKE_POOL = {} as unknown as CodeGenConnection;
const FAKE_USER = {} as unknown as UserInfo;

/** One record of a `deleteUnneededEntityFields` invocation. */
type PruneCall = { entityIDs: string[] | undefined };

/**
 * Stubs every DB-touching step of `manageEntityFields` so the METHOD'S CONTROL FLOW — which is
 * where #4050 lives — can be driven without a database. Each stub records the scope it was handed
 * so a test can assert "prune wide, everything else narrow" independently.
 */
class TestableManageMetadata extends ManageMetadataBase {
    public pruneCalls: PruneCall[] = [];
    public createCalls: (string[] | undefined)[] = [];
    public updateCalls: (string[] | undefined)[] = [];

    /** Entity name → ID, standing in for the live Metadata cache. */
    public entityIDsByName: Record<string, string> = {};

    /** Entity names the prune reports as having lost fields (what the real SP returns). */
    public prunedEntityNames: string[] = [];

    protected get dbProvider(): CodeGenDatabaseProvider {
        return { NeedsVirtualFieldNullabilityFix: false } as unknown as CodeGenDatabaseProvider;
    }

    protected resolveEntityNamesToIDs(entityNames: string[]): string[] {
        return entityNames.map((n) => this.entityIDsByName[n]).filter((id): id is string => !!id);
    }

    protected async deleteUnneededEntityFields(
        _pool: CodeGenConnection,
        _excludeSchemas: string[],
        entityIDs?: string[]
    ): Promise<{ success: boolean; prunedEntityNames: string[] }> {
        this.pruneCalls.push({ entityIDs });
        return { success: true, prunedEntityNames: this.prunedEntityNames };
    }

    protected async createNewEntityFieldsFromSchema(_pool: CodeGenConnection, entityIDs?: string[]): Promise<boolean> {
        this.createCalls.push(entityIDs);
        return true;
    }

    protected async updateExistingEntityFieldsFromSchema(
        _pool: CodeGenConnection,
        _excludeSchemas: string[],
        entityIDs?: string[]
    ): Promise<boolean> {
        this.updateCalls.push(entityIDs);
        return true;
    }

    protected async applySoftPKFKConfig(): Promise<boolean> { return true; }
    protected async manageParentEntityFields(): Promise<{ success: boolean; anyUpdates: boolean }> {
        return { success: true, anyUpdates: false };
    }
    protected async setDefaultColumnWidthWhereNeeded(): Promise<boolean> { return true; }
    protected async updateEntityFieldDisplayNameWhereNull(): Promise<boolean> { return true; }
    protected async manageEntityFieldValuesAndValidatorFunctions(): Promise<boolean> { return true; }
    protected async applyValueListConfig(): Promise<boolean> { return true; }
    protected async applyAdvancedGeneration(): Promise<boolean> { return true; }
}

/**
 * Pass 2's real call shape (sql_codegen.ts): skip the CreatedAt/UpdatedAt validation, skip entity
 * field values, run advanced generation, and DO prune. `entityFilter` is `newEntityList ∪
 * modifiedEntityList`.
 */
const runPass2 = (mm: TestableManageMetadata, entityFilter: string[] | undefined) =>
    mm.manageEntityFields(FAKE_POOL, ['sys', 'staging'], true, true, FAKE_USER, false, false, entityFilter);

/** Pass 1's real call shape: unscoped, but the prune is DEFERRED to Pass 2. */
const runPass1 = (mm: TestableManageMetadata) =>
    mm.manageEntityFields(FAKE_POOL, ['sys', 'staging'], false, false, FAKE_USER, true, true);

describe('#4050 — Pass 2 prunes orphaned EntityField rows', () => {
    let mm: TestableManageMetadata;

    beforeEach(() => {
        mm = new TestableManageMetadata();
    });

    it('prunes even when NO entity was flagged new or modified (the #4050 case)', async () => {
        // A CodeGen run on a convention-clean branch whose only change is a base view losing
        // columns: no table schema changed, so both lists are empty and the filter is []. The
        // empty filter must not carry the prune out with it — that is the whole failure.
        const ok = await runPass2(mm, []);

        expect(ok).toBe(true);
        expect(mm.pruneCalls.length).toBe(1);
    });

    it('prunes UNSCOPED — the orphaned entity is by definition absent from the filter', async () => {
        mm.entityIDsByName = { 'Some Other Entity': '11111111-1111-1111-1111-111111111111' };

        await runPass2(mm, ['Some Other Entity']);

        expect(mm.pruneCalls.length).toBe(1);
        // undefined ⇒ `buildHealSchemaRoutineParams` omits @EntityIDs ⇒ the SP scans every entity.
        // Scoping here is what makes the prune blind to the entity that actually needs it.
        expect(mm.pruneCalls[0].entityIDs).toBeUndefined();
    });

    it('keeps the OTHER Pass 2 steps scoped — only the prune goes wide', async () => {
        const id = '22222222-2222-2222-2222-222222222222';
        mm.entityIDsByName = { 'Journal Entries': id };

        await runPass2(mm, ['Journal Entries']);

        expect(mm.createCalls).toEqual([[id]]);
        expect(mm.updateCalls).toEqual([[id]]);
    });

    it('folds pruned entities into the Pass 2 scope so their Sequence is re-aligned', async () => {
        // spUpdateExistingEntityFieldsFromSchema rewrites Sequence from the live view. An entity
        // that just lost fields needs that rewrite, so it must enter the scope the prune widened.
        const prunedID = '33333333-3333-3333-3333-333333333333';
        mm.entityIDsByName = { 'Journal Entries': prunedID };
        mm.prunedEntityNames = ['Journal Entries'];

        await runPass2(mm, []);

        expect(mm.updateCalls).toEqual([[prunedID]]);
    });

    it('still short-circuits when there is nothing to prune and nothing in scope', async () => {
        // Nothing pruned + empty filter ⇒ the rest of Pass 2 is genuinely a no-op, as before.
        await runPass2(mm, []);

        expect(mm.createCalls).toEqual([]);
        expect(mm.updateCalls).toEqual([]);
    });

    it('reports a prune failure instead of returning true from the fast-exit', async () => {
        // The prune now runs on the path that used to return `true` unconditionally, so its
        // failure has to reach the caller — sql_codegen marks the whole SQL pass failed on it.
        const failing = new (class extends TestableManageMetadata {
            protected async deleteUnneededEntityFields(): Promise<{ success: boolean; prunedEntityNames: string[] }> {
                return { success: false, prunedEntityNames: [] };
            }
        })();

        await expect(runPass2(failing, [])).resolves.toBe(false);
    });

    it('Pass 1 still defers the prune (unchanged)', async () => {
        await runPass1(mm);

        expect(mm.pruneCalls).toEqual([]);
    });
});
