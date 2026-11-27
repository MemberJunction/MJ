/**
 * Unit tests for the save-time pricing decision of `MJAIPromptRunEntityServer.Save` when a run's completion arrives
 * while its INSERT is still in flight.
 *
 * The prompt runners queue a run's INSERT (`Status = 'Running'`, no `CompletedAt`) and its completion UPDATE
 * fire-and-forget. A fast model call completes during its own INSERT: the INSERT decided not to price (no
 * `CompletedAt` when it started), and its completion marks every field clean, `CompletedAt` included, so the UPDATE
 * saw nothing dirty and the run was never priced (the deterministic tier's IT108/IT110/IT121/IT172 "run Cost ... got
 * null", D-091 item 10). The server subclass now notes such a completion and prices the run on its next save.
 *
 * Harness: a stub generated base whose `Save` can be held open, the pricing pass replaced by a counter (its math has
 * its own suites).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** When `Hold` is set, the stub base's save waits on it before it completes (an INSERT in flight). */
const harness = vi.hoisted(() => ({ Hold: null as Promise<void> | null }));

// Neutralize the class-factory registration decorator (the stub base is not the generated class); leave the rest real.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

// Declared INSIDE the factory because `vi.mock` is hoisted above every top-level declaration here.
vi.mock('@memberjunction/ai-core-plus', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-core-plus')>();
    /** The generated prompt run's fields `Save` reads, as plain properties, with a dirty flag on `CompletedAt`. */
    class StubPromptRun {
        public ID = 'prompt-run-1';
        public ModelID: string | null = 'model-1';
        public VendorID: string | null = 'vendor-1';
        public ParentID: string | null = null;
        public RunType = 'Single';
        public TokensPrompt: number | null = null;
        public TokensCompletion: number | null = null;
        public TokensCacheRead: number | null = null;
        public TokensCacheWrite: number | null = null;
        public InputUnitsUsed: number | null = null;
        public OutputUnitsUsed: number | null = null;
        public UsageTypeID: string | null = null;
        public Cost: number | null = null;
        public DescendantCost: number | null = null;
        public TotalCost: number | null = null;
        public IsSaved = false;
        public CompletedAtDirty = false;
        private completedAt: Date | null = null;
        public get CompletedAt(): Date | null {
            return this.completedAt;
        }
        public set CompletedAt(value: Date | null) {
            this.completedAt = value;
            this.CompletedAtDirty = true;
        }
        public GetFieldByName(name: string): { Dirty: boolean } | undefined {
            return name === 'CompletedAt' ? { Dirty: this.CompletedAtDirty } : undefined;
        }
        /** Like BaseEntity: a completed save leaves every field clean, whatever changed while it ran. */
        public async Save(): Promise<boolean> {
            if (harness.Hold) await harness.Hold;
            this.IsSaved = true;
            this.CompletedAtDirty = false;
            return true;
        }
    }
    return { ...actual, MJAIPromptRunEntityExtended: StubPromptRun };
});

import { MJAIPromptRunEntityServer } from '../custom/MJAIPromptRunEntityServer.server';

/** The server subclass with its pricing pass counted instead of run. */
class CountingRun extends MJAIPromptRunEntityServer {
    public PricingPasses = 0;
    protected override async CalculateAndSetCost(): Promise<void> {
        this.PricingPasses++;
        this.Cost = 0.00024;
    }
}

/** Completes `run` in memory the way `BaseModelRunner.FinalizeRunRecord` does. */
function complete(run: CountingRun): void {
    run.CompletedAt = new Date('2026-11-26T12:00:00Z');
    run.TokensPrompt = 1000;
}

describe('MJAIPromptRunEntityServer.Save — a completion that lands during the INSERT', () => {
    let run: CountingRun;

    beforeEach(() => {
        harness.Hold = null;
        run = new CountingRun();
    });

    it('prices the run on the next save when it completed while its INSERT was in flight', async () => {
        let release: () => void = () => undefined;
        harness.Hold = new Promise<void>((resolve) => { release = resolve; });
        const insert = run.Save();
        complete(run);                       // the finalize lands while the INSERT is held open
        release();
        expect(await insert).toBe(true);
        expect(run.PricingPasses).toBe(0);   // the INSERT decided before the completion arrived
        expect(run.GetFieldByName('CompletedAt')?.Dirty).toBe(false);

        harness.Hold = null;
        expect(await run.Save()).toBe(true); // the completion UPDATE
        expect(run.PricingPasses).toBe(1);
        expect(run.Cost).toBe(0.00024);
    });

    it('prices once when the completion arrives after the INSERT (the ordinary order)', async () => {
        expect(await run.Save()).toBe(true);
        complete(run);
        expect(await run.Save()).toBe(true);
        expect(run.PricingPasses).toBe(1);
        expect(await run.Save()).toBe(true); // a later save (judge fields) does not price again
        expect(run.PricingPasses).toBe(1);
    });

    it('does not price again after the mid-INSERT completion has been priced', async () => {
        let release: () => void = () => undefined;
        harness.Hold = new Promise<void>((resolve) => { release = resolve; });
        const insert = run.Save();
        complete(run);
        release();
        await insert;
        harness.Hold = null;
        await run.Save();
        await run.Save();
        expect(run.PricingPasses).toBe(1);
    });

    it('does not mark a run that is still running', async () => {
        expect(await run.Save()).toBe(true);
        expect(await run.Save()).toBe(true);
        expect(run.PricingPasses).toBe(0);
    });
});
