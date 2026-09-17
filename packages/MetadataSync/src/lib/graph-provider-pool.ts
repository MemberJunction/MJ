/**
 * One independent provider per JSON-root graph for `mj sync push`.
 *
 * Sibling graphs may run in parallel; a root and its nested relatedEntities share
 * one provider so every DB op in that graph uses the same connection. Mixing the
 * host connection with a graph instance in the same tree is a deadlock (child FK
 * waits on an uncommitted parent).
 *
 * Drain: a graph is released at the end of a batch when (a) it will not appear
 * at a later level, or (b) its TransactionDepth is 0 (Save already committed,
 * so a fresh instance at the next level is safe). Graphs with leftover depth
 * stay live until their last level. Peak live independent instances is therefore
 * bounded by `--parallel-batch-size`, plus any still-open leftover-depth graphs.
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
  private anyFailed = false;
  /** Graphs whose onGraphComplete has already run, so a later release cannot repeat it. */
  private readonly completed = new Set<string>();

  /**
   * @param onGraphComplete invoked for each graph once every record in it is written and
   *   BEFORE its transaction settles. This is where work that had to wait for the whole
   *   graph runs — see BaseEntity.ProcessDeferredDerivedData — so its rows commit with the
   *   graph's own. It is skipped when the file has already failed, and a throw from it
   *   fails the graph, which rolls it back.
   */
  constructor(
    private readonly host: GraphProviderLike,
    private readonly log: (message: string) => void = () => undefined,
    private readonly onGraphComplete?: (graphId: string) => Promise<void>,
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

  /** One record error anywhere in the file rolls back every graph in that file. */
  markFailed(): void {
    this.anyFailed = true;
  }

  get hasFailed(): boolean {
    return this.anyFailed;
  }

  /**
   * Provider for this graph. Never returns a mix: either every graph in the
   * file gets its own independent instance, or (if the *first*
   * CreateIndependentInstance fails) every graph uses the host.
   *
   * If independent instances already exist and a later CreateIndependentInstance
   * throws, this throws rather than handing the rest of the file to the host.
   * Mid-file topology change is the deadlock this pool exists to prevent.
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
      const reason = (e as Error).message;
      if (this.providers.size > 0) {
        throw new Error(
          `CreateIndependentInstance failed after ${this.providers.size} graph(s) already had independent instances (${reason}). ` +
            `Refusing mixed host + independent topology in one file.`
        );
      }
      this.independentUnavailable = true;
      if (!this.unavailableLogged) {
        this.unavailableLogged = true;
        this.log(
          `⚠️  CreateIndependentInstance unavailable (${reason}); ` +
            `ALL graphs in this file use the host provider (inside the push transaction). ` +
            `Mixing host + independent instances in one file is a deadlock — we refuse that topology.`
        );
      }
      return this.host;
    }
  }

  /**
   * Commit-or-rollback + release graphs in this batch that are done:
   * their last level is `levelIndex`, or TransactionDepth is already 0
   * (Save settled; a fresh instance at a later level is safe).
   * Leftover-depth graphs that still appear later stay live.
   * Returns the first settle error so the caller cannot report success
   * with uncommitted rows.
   */
  async drainBatch(graphIds: string[], levelIndex: number): Promise<Error | undefined> {
    const ending = graphIds.filter((id) => {
      const last = this.lastLevelByGraph.get(id) ?? levelIndex;
      if (last === levelIndex) return true;
      const provider = this.providers.get(id);
      return !provider || provider.TransactionDepth === 0;
    });
    // Releasing a graph early and calling it COMPLETE are different questions. A graph is
    // released as soon as its provider is safe to hand back (settled depth, or the host
    // fallback where there is no instance to hold) — but it is only complete at the level
    // where its last record lives. Deferred work keyed off the release predicate would run
    // while later levels of the same graph are still unwritten, which is exactly what it
    // exists to avoid.
    const complete = new Set(
      graphIds.filter((id) => (this.lastLevelByGraph.get(id) ?? levelIndex) === levelIndex)
    );
    return this.releaseGraphs(ending, complete);
  }

  /** Release every remaining independent instance. Safe to call from `finally`. */
  async releaseAll(): Promise<Error | undefined> {
    const ids = [...this.providers.keys()];
    return this.releaseGraphs(ids, new Set(ids));
  }

  private async releaseGraphs(ids: string[], complete: Set<string>): Promise<Error | undefined> {
    let settleError: Error | undefined;
    for (const id of ids) {
      // Graph-complete work runs before the commit below, and before the host check —
      // a graph on the host provider is still a completed graph and still owed its
      // deferred work; it just settles with the host transaction instead of its own.
      if (this.onGraphComplete && !this.anyFailed && complete.has(id) && !this.completed.has(id)) {
        this.completed.add(id);
        try {
          await this.onGraphComplete(id);
        } catch (e) {
          this.anyFailed = true;
          settleError ??= e as Error;
          this.log(`Failed to complete graph ${id}: ${(e as Error).message}`);
        }
      }

      const provider = this.providers.get(id);
      this.providers.delete(id);
      if (!provider || provider === this.host) continue;

      try {
        if (provider.TransactionDepth > 0) {
          if (this.anyFailed) {
            // Explicit rollback at the call site — do not rely on
            // ReleaseIndependentInstance's implicit leftover-depth rollback.
            await provider.RollbackTransaction();
          } else {
            await provider.CommitTransaction();
          }
        }
      } catch (e) {
        this.anyFailed = true;
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
