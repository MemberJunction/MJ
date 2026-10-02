/**
 * @fileoverview Periodic reconciliation of engine caches against the database (plan Phase 3.1).
 *
 * Engines stay current through entity events. A change made without one — direct SQL, another
 * application, a restore — is otherwise invisible to every server until the cache entry expires
 * or someone clears it. The sweeper asks each loaded engine to compare its rows with the database
 * ({@link BaseEngine.SweepAgainstDatabase}) on an interval.
 *
 * On a shared cache, a per-engine lease means one server sweeps each engine per interval; the
 * server that reloads writes the fresh rows once and the others adopt them.
 */
import { BaseSingleton } from '@memberjunction/global';
import { BaseEngineRegistry } from './baseEngineRegistry';
import { LocalCacheManager } from './localCacheManager';
import { LogError } from './logging';
import type { EngineSweepResult } from './baseEngine';

/** The part of an engine the sweeper uses. */
interface SweepableEngine {
    readonly Loaded: boolean;
    SweepAgainstDatabase(): Promise<EngineSweepResult>;
    /** Whether the engine holds any config a sweep could act on. See {@link BaseEngine.HasSweepableConfigs}. */
    HasSweepableConfigs(): boolean;
}

function isSweepable(engine: unknown): engine is SweepableEngine {
    const candidate = engine as Partial<SweepableEngine> | null;
    return typeof candidate?.SweepAgainstDatabase === 'function'
        && typeof candidate.HasSweepableConfigs === 'function'
        && candidate.Loaded === true;
}

/** Leases end this long before the next tick, so the same server can claim them again. */
const LEASE_MARGIN_MS = 1000;

export class BaseEngineSweeper extends BaseSingleton<BaseEngineSweeper> {
    private timer: ReturnType<typeof setInterval> | null = null;
    private sweeping = false;

    public static get Instance(): BaseEngineSweeper {
        return super.getInstance<BaseEngineSweeper>();
    }

    /** True while a periodic sweep is scheduled. */
    public get IsRunning(): boolean {
        return this.timer !== null;
    }

    /**
     * Sweeps every `intervalMs` until {@link Stop}. Replaces any earlier schedule; an interval of
     * 0 or less only stops it. The timer does not keep the process alive.
     */
    public Start(intervalMs: number): void {
        this.Stop();
        if (intervalMs <= 0) {
            return;
        }
        const leaseMs = Math.max(LEASE_MARGIN_MS, intervalMs - LEASE_MARGIN_MS);
        this.timer = setInterval(() => void this.tick(leaseMs), intervalMs);
        (this.timer as { unref?: () => void }).unref?.();
    }

    public Stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Sweeps every loaded engine once.
     * @param leaseMs - When set, an engine is swept only if this process claims its lease for this
     *                  long, so a fleet sweeps each engine once. Omit to sweep unconditionally.
     * @returns One result per engine swept.
     */
    public async SweepOnce(leaseMs?: number): Promise<EngineSweepResult[]> {
        const results: EngineSweepResult[] = [];
        for (const engine of BaseEngineRegistry.Instance.GetAllEngines()) {
            if (!isSweepable(engine)) {
                continue;
            }
            // Ask before paying. The lease is a cross-process round trip and the sweep a database
            // query, and an engine whose entities all trust their cache has nothing for either to
            // find — so on a stock installation this loop claims no leases at all.
            if (!engine.HasSweepableConfigs()) {
                continue;
            }
            if (leaseMs !== undefined && !(await LocalCacheManager.Instance.TryAcquireSharedLease(`engine-sweep:${engine.constructor.name}`, leaseMs))) {
                continue;
            }
            results.push(await engine.SweepAgainstDatabase());
        }
        return results;
    }

    private async tick(leaseMs: number): Promise<void> {
        if (this.sweeping) {
            return; // the previous sweep is still running
        }
        this.sweeping = true;
        try {
            await this.SweepOnce(leaseMs);
        } catch (e) {
            LogError(`BaseEngineSweeper: sweep failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            this.sweeping = false;
        }
    }
}
