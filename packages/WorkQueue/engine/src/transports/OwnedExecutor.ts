import type { WorkQueueExecutorSource, WorkQueueIndependentExecutor } from '../sql/WorkQueueSqlExecutor';

/**
 * One independent executor, minted on first use and released on close (03 §11 "Executor ownership", F8). Consumers
 * and operators run single statements on it concurrently — it has its own transaction stack, and nothing here ever
 * opens a transaction on it, so an unrelated unit of work on the shared provider can never absorb a claim or a settle.
 */
export class OwnedExecutor {
    private instance: Promise<WorkQueueIndependentExecutor> | null = null;

    constructor(private readonly source: WorkQueueExecutorSource) {}

    public Get(): Promise<WorkQueueIndependentExecutor> {
        const existing = this.instance;
        if (existing) {
            return existing;
        }
        const minted = this.source.CreateIndependentInstance();
        this.instance = minted;
        minted.catch(() => {
            if (this.instance === minted) {
                this.instance = null;       // never cache a failed mint
            }
        });
        return minted;
    }

    public async Release(): Promise<void> {
        const held = this.instance;
        this.instance = null;
        if (held) {
            const executor = await held.catch(() => null);
            await executor?.ReleaseIndependentInstance();
        }
    }
}
