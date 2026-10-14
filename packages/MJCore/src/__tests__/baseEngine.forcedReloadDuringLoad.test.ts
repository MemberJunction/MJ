import { describe, it, expect } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { UserInfo } from '../generic/securityInfo';
import { IMetadataProvider, ProviderType } from '../generic/interfaces';

/**
 * A forced reload requested while a load is in flight must not be absorbed by that load: the load in flight may
 * have read the data before the change that asked for the reload (a Template saved, then its Template
 * Contents saved, back to back). BaseEngine queues one more forced load behind the one in flight; a burst of
 * forced requests shares it, and every caller resolves after it. A plain load still just joins.
 */

/** A deferred promise the test releases by hand. */
interface Gate {
    Promise: Promise<void>;
    Release: () => void;
}
function gate(): Gate {
    let release: () => void = () => undefined;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    return { Promise: promise, Release: release };
}

/** A client-side provider, so the load needs no context user and resolves no system user. */
const PROVIDER_MEMBERS: Pick<IMetadataProvider, 'ProviderType' | 'InstanceConnectionString'> = {
    ProviderType: ProviderType.Network,
    InstanceConnectionString: 'test://forced-reload',
};
// a Pick double: the load path reads only the members picked above (LoadConfigs is overridden)
const PROVIDER = PROVIDER_MEMBERS as IMetadataProvider;

/** Counts loads and holds each one on a gate the test releases. */
class GatedEngine extends BaseEngine<GatedEngine> {
    public LoadCount = 0;
    public Gates: Gate[] = [];
    public Events: string[] = [];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        await this.Load([new BaseEnginePropertyConfig({ Type: 'dataset', DatasetName: 'X', PropertyName: '_x' })],
            provider ?? PROVIDER, forceRefresh, contextUser);
    }

    protected override async LoadConfigs(): Promise<void> {
        this.LoadCount++;
        const g = gate();
        this.Gates.push(g);
        this.Events.push(`load ${this.LoadCount} started`);
        await g.Promise;
        this.Events.push(`load ${this.LoadCount} finished`);
    }

    /** Waits until load `n` has started (its gate exists). */
    public async LoadStarted(n: number): Promise<Gate> {
        for (let i = 0; i < 100 && this.Gates.length < n; i++) {
            await new Promise((r) => setTimeout(r, 1));
        }
        const g = this.Gates[n - 1];
        if (!g) throw new Error(`load ${n} never started`);
        return g;
    }
}

function freshEngine(): GatedEngine {
    const store = GetGlobalObjectStore();
    if (store) {
        delete store[`___SINGLETON__${GatedEngine.name}`];
    }
    return new GatedEngine();
}

describe('BaseEngine.Load: forced reload requested while a load is in flight', () => {
    it('runs exactly one more load for a burst of forced requests, and resolves both callers after it', async () => {
        const engine = freshEngine();
        const first = engine.Config(false);
        const firstGate = await engine.LoadStarted(1);

        const resolved: string[] = [];
        const forcedA = (async () => {
            await engine.Config(true);
            resolved.push('A');
            engine.Events.push('A resolved');
        })();
        const forcedB = (async () => {
            await engine.Config(true);
            resolved.push('B');
            engine.Events.push('B resolved');
        })();

        firstGate.Release();
        await first;
        expect(resolved).toEqual([]); // the forced callers wait for the extra load, not the one they arrived during

        const secondGate = await engine.LoadStarted(2);
        expect(resolved).toEqual([]);
        secondGate.Release();
        await Promise.all([forcedA, forcedB]);

        expect(engine.LoadCount).toBe(2);
        expect(resolved.sort()).toEqual(['A', 'B']);
        expect(engine.Events.indexOf('load 2 finished')).toBeLessThan(engine.Events.indexOf('A resolved'));
        expect(engine.Events.indexOf('load 2 finished')).toBeLessThan(engine.Events.indexOf('B resolved'));
    });

    it('lets a plain load requested during a load in flight just join it', async () => {
        const engine = freshEngine();
        const first = engine.Config(false);
        const firstGate = await engine.LoadStarted(1);

        const joined = engine.Config(false);
        firstGate.Release();
        await Promise.all([first, joined]);

        expect(engine.LoadCount).toBe(1);
    });

    it('queues a forced request made during the extra load behind it, so it is not lost either', async () => {
        const engine = freshEngine();
        const first = engine.Config(false);
        const firstGate = await engine.LoadStarted(1);
        const forced1 = engine.Config(true);
        firstGate.Release();
        await first;
        const secondGate = await engine.LoadStarted(2);
        const forced2 = engine.Config(true); // arrives while the extra load runs
        secondGate.Release();
        await forced1;
        (await engine.LoadStarted(3)).Release();
        await forced2;

        expect(engine.LoadCount).toBe(3);
    });
});
