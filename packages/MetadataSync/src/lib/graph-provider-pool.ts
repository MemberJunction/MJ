/**
 * One independent provider per JSON-root graph for `mj sync push`.
 *
 * Sibling graphs may run in parallel; a root and its nested relatedEntities share
 * one provider so every DB op in that graph uses the same connection. Mixing the
 * host connection with a graph instance in the same tree is a deadlock (child FK
 * waits on an uncommitted parent).
 *
 * Providers are released as soon as a graph's last dependency level is done, so
 * peak live instances is bounded by `--parallel-batch-size` (plus graphs that
 * still have later levels), not by the file's root count.
 */

export interface GraphProviderLike {
  TransactionDepth: number;
  CreateIndependentInstance(): Promise<GraphProviderLike>;
  CommitTransaction(): Promise<void>;
  RollbackTransaction(): Promise<void>;
  ReleaseIndependentInstance(): Promise<void>;
}

export class GraphProviderPool {
  private readonly providers = new Map<string, GraphProviderLike>();
  private readonly lastLevelByGraph = new Map<string, number>();
  private independentUnavailable = false;
  private unavailableLogged = false;
  private readonly failedGraphs = new Set<string>();
  private anyFailed = false;

  constructor(
    private readonly host: GraphProviderLike,
    private readonly log: (message: string) => void = () => undefined,
  ) {}

  /**
   * Record, per graphId, the highest dependency-level index it occupies so we
   * can drain (commit/rollback + release) as soon as that level finishes.
   */
  noteLevels(levels: Array<Array<{ graphId: string }>>): void {
    this.lastLevelByGraph.clear();
    for (let i = 0; i < levels.length; i++) {
      for (const rec of levels[i]) {
        this.lastLevelByGraph.set(rec.graphId, i);
      }
    }
  }

  markFailed(graphId?: string): void {
    this.anyFailed = true;
    if (graphId) this.failedGraphs.add(graphId);
  }

  get hasFailed(): boolean {
    return this.anyFailed;
  }

  /**
   * Provider for this graph. Never returns a mix: either every graph in the
   * file gets its own independent instance, or (if CreateIndependentInstance
   * is unimplemented) every graph uses the host. Mixing those topologies is
   * the deadlock this pool exists to prevent.
   *
   * The host itself is never stored in the map, so release cannot
   * RollbackTransaction the global push TX.
   */
  async obtain(graphId: string): Promise<GraphProviderLike> {
    const existing = this.providers.get(graphId);
    if (existing) return existing;
    if (this.independentUnavailable) return this.host;

    try {
      const created = await this.host.CreateIndependentInstance();
      this.providers.set(graphId, created);
      return created;
    } catch (e) {
      this.independentUnavailable = true;
      if (!this.unavailableLogged) {
        this.unavailableLogged = true;
        this.log(
          `⚠️  CreateIndependentInstance unavailable (${(e as Error).message}); ` +
            `ALL graphs in this file use the host provider (inside the push transaction). ` +
            `Mixing host + independent instances in one file is a deadlock — we refuse that topology.`
        );
      }
      return this.host;
    }
  }

  /**
   * Commit-or-rollback + release every graph in `graphIds` whose last level is
   * `levelIndex`. Graphs that still appear at a later level stay live.
   * Returns the first settle error (commit/rollback failure) so the caller can
   * fail the push instead of reporting success with uncommitted rows.
   */
  async drainBatch(graphIds: string[], levelIndex: number): Promise<Error | undefined> {
    const ending = graphIds.filter(
      (id) => (this.lastLevelByGraph.get(id) ?? levelIndex) === levelIndex
    );
    return this.releaseGraphs(ending);
  }

  /** Release every remaining independent instance. Safe to call from `finally`. */
  async releaseAll(): Promise<Error | undefined> {
    return this.releaseGraphs([...this.providers.keys()]);
  }

  private async releaseGraphs(ids: string[]): Promise<Error | undefined> {
    let settleError: Error | undefined;
    for (const id of ids) {
      const provider = this.providers.get(id);
      this.providers.delete(id);
      if (!provider || provider === this.host) continue;

      const failed = this.anyFailed || this.failedGraphs.has(id);
      try {
        if (provider.TransactionDepth > 0) {
          if (failed) {
            // Explicit rollback at the call site — do not rely on
            // ReleaseIndependentInstance's implicit leftover-depth rollback.
            await provider.RollbackTransaction();
          } else {
            await provider.CommitTransaction();
          }
        }
      } catch (e) {
        this.anyFailed = true;
        this.failedGraphs.add(id);
        settleError ??= e as Error;
        this.log(`Failed to settle graph ${id} transaction: ${(e as Error).message}`);
        try {
          if (provider.TransactionDepth > 0) {
            await provider.RollbackTransaction();
          }
        } catch {
          /* still release */
        }
      } finally {
        try {
          await provider.ReleaseIndependentInstance();
        } catch {
          /* pool-safe: handle already dropped */
        }
      }
    }
    return settleError;
  }
}
