/**
 * The idempotency check must put the engine back (plan §22.3, §25.2).
 *
 * `VerifyDerivedStateIdempotent` runs `AdditionalLoading` twice on a LIVE engine and leaves the
 * result in place. For an idempotent engine that is harmless by definition. For a non-idempotent one
 * — the case the check exists to find — the engine is left with derived state nothing else will
 * correct, so one detected defect quietly becomes wrong answers everywhere afterwards: in the
 * integration tier, every later check runs against the corrupted engine; in a server, the diagnostic
 * itself degrades the process it was called to inspect.
 *
 * A diagnostic that damages what it measures is not a diagnostic.
 */
import { describe, it, expect } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { UserInfo } from '../generic/securityInfo';

type Parent = { ID: string; Children: string[] };

const ENTITY = 'Parents';

/** Fresh rows on every load, as a real reload from the database gives. */
function freshRows(): Parent[] {
    return [{ ID: 'p1', Children: [] }, { ID: 'p2', Children: [] }];
}

class AppendingEngine extends BaseEngine<AppendingEngine> {
    public _parents: Parent[] = [];
    /** How many times rows were actually re-read — a restore costs one, a no-op costs none. */
    public Loads = 0;
    /** AdditionalLoading appends rather than replaces, so every run grows the derived state. */
    public Appends = false;

    public constructor() {
        super();
        const config: BaseEnginePropertyConfig = { Type: 'entity', EntityName: ENTITY, PropertyName: '_parents', ResultType: 'simple' };
        const self = this as unknown as {
            _metadataConfigs: BaseEnginePropertyConfig[];
            _dataMap: Map<string, unknown>;
            _loaded: boolean;
            _contextUser: UserInfo | undefined;
        };
        self._metadataConfigs = [config];
        self._dataMap = new Map([['_parents', { entityName: ENTITY, data: [], loadedSuccessfully: true }]]);
        self._loaded = true;
        self._contextUser = undefined;
        this._parents = freshRows();
    }

    public override get Loaded(): boolean { return true; }

    protected override get ProviderToUse() {
        return { EntityByName: () => ({ Name: ENTITY, Fields: [], PrimaryKeys: [{ Name: 'ID' }] }) } as never;
    }

    /** A reload reads fresh rows, exactly as one from the database would. */
    protected override get RunViewProviderToUse() {
        return {
            EntityByName: () => ({ Name: ENTITY, Fields: [], PrimaryKeys: [{ Name: 'ID' }] }),
            RunViews: async (params: unknown[]) => {
                this.Loads++;
                return params.map(() => ({
                    Success: true, Results: freshRows(), RowCount: 2, TotalRowCount: 2,
                    ErrorMessage: '', ExecutionTime: 0, UserViewRunID: '',
                }));
            },
        } as never;
    }

    protected override async Config(): Promise<void> { /* rows are installed by the constructor */ }

    /** One run, as a normal load performs — the state a verification must leave behind. */
    public async LoadOnce(): Promise<void> {
        await this.AdditionalLoading(undefined);
    }

    protected override async AdditionalLoading(_contextUser?: UserInfo): Promise<void> {
        for (const parent of this._parents) {
            if (this.Appends) {
                parent.Children.push('c');                                 // grows every run
            } else {
                parent.Children.splice(0, parent.Children.length, 'c');    // replaces
            }
        }
    }

    protected override GetDerivedStateCensus(): Record<string, number> {
        return { ChildrenAttached: this._parents.reduce((n, p) => n + p.Children.length, 0) };
    }

    /** What a normal load leaves behind. */
    public get Attached(): number {
        return this._parents.reduce((n, p) => n + p.Children.length, 0);
    }
}

async function loadedEngine(appends: boolean): Promise<AppendingEngine> {
    const engine = new AppendingEngine();
    engine.Appends = appends;
    await engine.LoadOnce();
    return engine;
}

describe('verifying idempotency leaves the engine as it found it', () => {
    it('puts a drifting engine back to what a normal load produces', async () => {
        const engine = await loadedEngine(true);
        const baseline = engine.Attached;
        expect(baseline).toBe(2); // one AdditionalLoading run over two parents

        const result = await engine.VerifyDerivedStateIdempotent();

        // The finding still stands...
        expect(result.Idempotent).toBe(false);
        expect(result.AfterFirst.ChildrenAttached).toBe(4);
        expect(result.AfterSecond.ChildrenAttached).toBe(6);
        // ...and the engine is no longer carrying the two extra runs.
        expect(engine.Attached).toBe(baseline);
        expect(result.Restored).toBe(true);
    });

    it('does not reload an engine that was already idempotent', async () => {
        const engine = await loadedEngine(false);
        const loadsBefore = engine.Loads;

        const result = await engine.VerifyDerivedStateIdempotent();

        expect(result.Idempotent).toBe(true);
        expect(result.Restored).toBe(true);   // nothing to undo: the runs left it identical
        expect(engine.Loads).toBe(loadsBefore); // so no database round trip was spent
        expect(engine.Attached).toBe(2);
    });
});
