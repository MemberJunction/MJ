/**
 * Derived-state rebuilds must be idempotent (plan §10, Phase 5).
 *
 * `AdditionalLoading` runs again after every reload and cross-server payload, against the parent
 * objects already in place. A rebuild that appends instead of replacing grows derived state on
 * every event; one that clears before an early return loses it. Both are invisible to row counts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { UserInfo } from '../generic/securityInfo';
import { IMetadataProvider, RunViewResult } from '../generic/interfaces';
import * as Logging from '../generic/logging';

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
    afterEach(() => {
        BaseEngine.VerifyDerivedStateOnRebuild = false;
        vi.restoreAllMocks();
    });

    it('reports a rebuild that replaces its derived state as idempotent', async () => {
        const engine = new GroupingEngine();
        engine.Prepare();
        const result = await engine.VerifyDerivedStateIdempotent();
        // `Restored: true` with nothing reloaded: an idempotent rebuild leaves exactly what one run
        // leaves, so there is nothing to undo. See baseEngine.verifyRestoresState.test.ts.
        expect(result).toEqual({ EngineClass: 'GroupingEngine', Idempotent: true, AfterFirst: { ChildrenAttached: 2 }, AfterSecond: { ChildrenAttached: 2 }, Restored: true, RestoreError: undefined });
    });

    it('reports a rebuild that appends as not idempotent', async () => {
        const engine = new GroupingEngine();
        engine.Prepare();
        engine.Appends = true;
        const result = await engine.VerifyDerivedStateIdempotent();
        expect(result.Idempotent).toBe(false);
        expect(result.AfterFirst.ChildrenAttached).toBe(2);
        expect(result.AfterSecond.ChildrenAttached).toBe(4);
    });

    it('logs the engine by name on rebuild when verification is on, and runs once when it is off', async () => {
        const logError = vi.spyOn(Logging, 'LogError').mockImplementation(() => undefined);
        const engine = new GroupingEngine();
        engine.Prepare();
        engine.Appends = true;

        await engine.Rebuild();
        expect(engine._parents[0].Children).toHaveLength(1);
        expect(logError).not.toHaveBeenCalled();

        BaseEngine.VerifyDerivedStateOnRebuild = true;
        await engine.Rebuild();
        expect(engine._parents[0].Children).toHaveLength(3);
        expect(logError).toHaveBeenCalledWith(expect.stringContaining('GroupingEngine: AdditionalLoading is not idempotent'));
    });
});
