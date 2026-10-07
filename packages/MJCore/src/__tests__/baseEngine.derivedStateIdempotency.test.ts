/**
 * Derived-state rebuilds must be idempotent (Phase 5).
 *
 * `AdditionalLoading` runs again after every reload and cross-server cache payload, against the
 * parent objects already in place. A rebuild that appends instead of replacing grows derived state
 * on every event; one that clears before an early return loses it. Both are invisible to row counts,
 * because the cached arrays are unchanged — only what the engine derives from them is wrong.
 *
 * This is not hypothetical. #4470 fixed exactly this in `AIEngineBase`: children were associated by
 * appending, so one cross-server cache event left every agent holding its Actions twice, five events
 * left them six times over, and nothing in the row counts or identity hashes showed it.
 *
 * The check lives here, at the engine level, where a subclass can reach `AdditionalLoading` and
 * `GetStateCensus` directly. An engine with non-trivial derived state should own a test of this
 * shape; there is deliberately no product API for asking an engine to verify itself.
 */
import { describe, it, expect } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { UserInfo } from '../generic/securityInfo';
import { IMetadataProvider, RunViewResult } from '../generic/interfaces';

type Parent = { ID: string; Children: string[] };

const CONFIG = new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Parents', PropertyName: '_parents', ResultType: 'simple' });

class GroupingEngine extends BaseEngine<GroupingEngine> {
    public _parents: Parent[] = [];
    public Appends = false;

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo): Promise<void> {
        // configs are injected directly
    }

    public Prepare(): void {
        (this as unknown as { _provider: IMetadataProvider })._provider = { EntityByName: () => undefined } as unknown as IMetadataProvider;
        const rows: Parent[] = [{ ID: 'p1', Children: [] }, { ID: 'p2', Children: [] }];
        const result: RunViewResult = { Success: true, Results: rows, RowCount: 2, TotalRowCount: 2, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
        this.HandleSingleViewResult(CONFIG, result);
    }

    public Rebuild(): Promise<void> {
        return this.RebuildDerivedState();
    }

    /** One rebuild, reaching the protected hook directly — no product API needed. */
    public RebuildOnce(): Promise<void> {
        return this.AdditionalLoading();
    }

    /** The derived counts, which are what a drifting rebuild changes and row counts do not. */
    public get DerivedCounts(): Record<string, number> {
        return this.GetStateCensus().Derived;
    }

    protected override async AdditionalLoading(_contextUser?: UserInfo): Promise<void> {
        for (const parent of this._parents) {
            if (this.Appends) {
                parent.Children.push('c');              // grows on every run
            } else {
                parent.Children.splice(0, parent.Children.length, 'c');   // replaces
            }
        }
    }

    protected override GetDerivedStateCensus(): Record<string, number> {
        return { ChildrenAttached: this._parents.reduce((n, p) => n + p.Children.length, 0) };
    }
}

describe('BaseEngine derived-state idempotency', () => {
    it('converges when the rebuild REPLACES its derived state', async () => {
        const engine = new GroupingEngine();
        engine.Prepare();

        await engine.RebuildOnce();
        const afterFirst = engine.DerivedCounts;
        await engine.RebuildOnce();

        expect(afterFirst).toEqual({ ChildrenAttached: 2 });
        expect(engine.DerivedCounts).toEqual(afterFirst);
    });

    it('grows without bound when the rebuild APPENDS — the #4470 shape', async () => {
        const engine = new GroupingEngine();
        engine.Prepare();
        engine.Appends = true;

        await engine.RebuildOnce();
        expect(engine.DerivedCounts).toEqual({ ChildrenAttached: 2 });
        await engine.RebuildOnce();
        expect(engine.DerivedCounts).toEqual({ ChildrenAttached: 4 });   // one cache event: doubled
        await engine.RebuildOnce();
        expect(engine.DerivedCounts).toEqual({ ChildrenAttached: 6 });   // two events: tripled

        // And the row count — the thing most tests assert — never moved.
        expect(engine._parents.length).toBe(2);
    });

    it('rebuilds through the cache-event path without touching the database', async () => {
        // RebuildDerivedState is what a cross-server payload triggers. It runs AdditionalLoading
        // once, in a queue that serializes bursts; it does NOT reload rows.
        const engine = new GroupingEngine();
        engine.Prepare();

        await engine.Rebuild();
        await engine.Rebuild();

        expect(engine.DerivedCounts).toEqual({ ChildrenAttached: 2 });
    });
});
