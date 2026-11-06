import { describe, it, expect } from 'vitest';
import { SharedLoad } from '../generic/sharedLoad';

/** The stand-in data each load reads when it starts. */
let server: string[] = [];

/** A load that reads {@link server} at once and lands when the test releases it. */
class GatedLoads {
    public Rows: string[] = [];
    public Started = 0;
    private pending: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];

    public Load = (): Promise<void> => {
        this.Started++;
        const snapshot = [...server];
        return new Promise<void>((resolve, reject) => {
            this.pending.push({
                resolve: () => {
                    this.Rows = snapshot;
                    resolve();
                },
                reject,
            });
        });
    };

    /** Lands the oldest load still in flight and lets what follows it run. */
    public async LandNext(error?: Error): Promise<void> {
        expect(this.pending.length).toBeGreaterThan(0);
        const next = this.pending.shift()!;
        if (error) {
            next.reject(error);
        } else {
            next.resolve();
        }
        await settle();
    }

    public get InFlight(): number {
        return this.pending.length;
    }
}

function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SharedLoad', () => {
    it('REGRESSION: a forced call during a running load gets a load that starts after it', async () => {
        server = ['a'];
        const shared = new SharedLoad();
        const loads = new GatedLoads();
        const running = shared.Run(false, loads.Load);
        server = ['a', 'b'];
        const forced = shared.Run(true, loads.Load);

        await loads.LandNext();
        await running;
        expect(loads.InFlight).toBe(1); // the extra load started only after the first settled
        await loads.LandNext();
        await forced;

        expect(loads.Started).toBe(2);
        expect(loads.Rows).toEqual(['a', 'b']);
    });

    it('forced calls during one load share one extra load', async () => {
        server = ['a'];
        const shared = new SharedLoad();
        const loads = new GatedLoads();
        const running = shared.Run(true, loads.Load);
        server = ['a', 'b'];
        const forced = [shared.Run(true, loads.Load), shared.Run(true, loads.Load), shared.Run(true, loads.Load)];

        await loads.LandNext();
        await running;
        await loads.LandNext();
        await Promise.all(forced);

        expect(loads.Started).toBe(2);
        expect(loads.InFlight).toBe(0);
    });

    it('a call without forceRefresh joins the running load', async () => {
        server = ['a'];
        const shared = new SharedLoad();
        const loads = new GatedLoads();
        const running = shared.Run(true, loads.Load);
        const joined = shared.Run(false, loads.Load);

        expect(shared.IsLoading).toBe(true);
        await loads.LandNext();
        await Promise.all([running, joined]);

        expect(loads.Started).toBe(1);
        expect(shared.IsLoading).toBe(false);
    });

    it('a forced call during the extra load gets one of its own', async () => {
        server = ['a'];
        const shared = new SharedLoad();
        const loads = new GatedLoads();
        const running = shared.Run(false, loads.Load);
        const first = shared.Run(true, loads.Load);
        await loads.LandNext();
        await running;

        server = ['a', 'c'];
        const second = shared.Run(true, loads.Load);
        await loads.LandNext();
        await first;
        await loads.LandNext();
        await second;

        expect(loads.Started).toBe(3);
        expect(loads.Rows).toEqual(['a', 'c']);
    });

    it('a forced call still gets its load when the running one fails, and joiners see the failure', async () => {
        server = ['a'];
        const shared = new SharedLoad();
        const loads = new GatedLoads();
        const running = shared.Run(false, loads.Load);
        const joined = shared.Run(false, loads.Load);
        const forced = shared.Run(true, loads.Load);
        const failure = new Error('load failed');

        await loads.LandNext(failure);
        await expect(running).rejects.toBe(failure);
        await expect(joined).rejects.toBe(failure);
        await loads.LandNext();
        await expect(forced).resolves.toBeUndefined();
        expect(loads.Started).toBe(2);
    });

    it('is not left loading when the load throws synchronously', async () => {
        const shared = new SharedLoad();
        const failure = new Error('threw before returning a promise');
        await expect(shared.Run(false, () => { throw failure; })).rejects.toBe(failure);
        expect(shared.IsLoading).toBe(false);

        let ran = false;
        await shared.Run(false, async () => { ran = true; });
        expect(ran).toBe(true);
    });
});
