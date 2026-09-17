/**
 * Provider assignment per JSON-root graph for `mj sync push`.
 *
 * Two modes, fixed when the pool is built. A pool never mixes them.
 *
 * - **`host`** (atomic push, the default): every graph uses the host provider, inside the
 *   push transaction. Nothing commits until the push commits. The host has ONE transaction
 *   stack, so graphs must run one at a time: `obtain` throws if a second graph asks for the
 *   host while another graph still holds it. The caller releases a graph with `drainBatch`.
 *
 * - **`independent`** (`--no-atomic`): each graph gets its own instance from
 *   `CreateIndependentInstance()` (shared pool, own transaction stack), so sibling graphs can
 *   run in parallel. A root and its nested relatedEntities share one instance, so every DB op
 *   in that graph uses the same connection. Each `Save()` commits on its own, so this mode is
 *   NOT atomic: `onGraphSettled` reports which graphs left committed rows behind.
 *   If `CreateIndependentInstance` fails, `obtain` throws. It never falls back to the host,
 *   because mixing the host connection with graph instances is a deadlock (child FK waits on
 *   an uncommitted parent). The caller decides the mode up front (see `probeIndependentInstances`).
 *
 * Drain (independent mode): a graph is released at the end of a batch when (a) it will not
 * appear at a later level, or (b) its TransactionDepth is 0 (Save already committed, so a fresh
 * instance at the next level is safe). Graphs with leftover depth stay live until their last
 * level. Peak live independent instances is therefore bounded by the batch size, plus any
 * still-open leftover-depth graphs.
 */

export interface GraphProviderLike {
  TransactionDepth: number;
  CreateIndependentInstance(): Promise<GraphProviderLike>;
  CommitTransaction(): Promise<void>;
  RollbackTransaction(): Promise<void>;
  ReleaseIndependentInstance(): Promise<void>;
}

export type GraphProviderMode = 'host' | 'independent';

/**
 * How a graph's writes ended when its provider was released.
 * `committed`: its rows are in the database (independent mode only).
 * `rolledBack`: its open transaction was rolled back.
 */
export type GraphSettleOutcome = 'committed' | 'rolledBack';

export interface GraphProviderPoolOptions {
  mode: GraphProviderMode;
  log?: (message: string) => void;
  /** Independent mode only: called once per released graph with how its writes ended. */
  onGraphSettled?: (graphId: string, outcome: GraphSettleOutcome) => void;
}

/**
 * Checks once whether the host can create independent instances. Used to pick the pool mode
 * before any graph runs, so a push never discovers mid-file that it has to switch topology.
 * @returns `undefined` when independent instances work, otherwise the reason they do not.
 */
export async function probeIndependentInstances(host: GraphProviderLike): Promise<string | undefined> {
  let instance: GraphProviderLike;
  try {
    instance = await host.CreateIndependentInstance();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  try {
    await instance.ReleaseIndependentInstance();
  } catch {
    /* the probe instance did no work; a failed release changes nothing */
  }
  return undefined;
}

export class GraphProviderPool {
  private readonly providers = new Map<string, GraphProviderLike>();
  private readonly lastLevelByGraph = new Map<string, number>();
  private readonly mode: GraphProviderMode;
  private readonly log: (message: string) => void;
  private readonly onGraphSettled?: (graphId: string, outcome: GraphSettleOutcome) => void;
  private hostHolder: string | undefined;
  private anyFailed = false;

  constructor(
    private readonly host: GraphProviderLike,
    options: GraphProviderPoolOptions,
  ) {
    this.mode = options.mode;
    this.log = options.log ?? (() => undefined);
    this.onGraphSettled = options.onGraphSettled;
  }

  get Mode(): GraphProviderMode {
    return this.mode;
  }

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

  /** Provider for this graph. See the class comment for the per-mode rules. */
  async obtain(graphId: string): Promise<GraphProviderLike> {
    if (this.mode === 'host') {
      return this.obtainHost(graphId);
    }
    const existing = this.providers.get(graphId);
    if (existing) return existing;

    try {
      const created = await this.host.CreateIndependentInstance();
      this.providers.set(graphId, created);
      return created;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      throw new Error(
        `CreateIndependentInstance failed for graph ${graphId} (${reason}). ` +
          `Refusing to run this graph on the host provider: mixing host and independent instances is a deadlock.`
      );
    }
  }

  private obtainHost(graphId: string): GraphProviderLike {
    if (this.hostHolder !== undefined && this.hostHolder !== graphId) {
      throw new Error(
        `Graph ${graphId} asked for the host provider while graph ${this.hostHolder} still holds it. ` +
          `In atomic mode graphs share one transaction stack and must run one at a time.`
      );
    }
    this.hostHolder = graphId;
    return this.host;
  }

  /**
   * Release graphs in this batch that are done. Host mode: frees the host for the next graph
   * (the push transaction settles it later). Independent mode: commit-or-rollback + release the
   * graphs whose last level is `levelIndex`, or whose TransactionDepth is already 0.
   * Returns the first settle error so the caller cannot report success with uncommitted rows.
   */
  async drainBatch(graphIds: string[], levelIndex: number): Promise<Error | undefined> {
    if (this.mode === 'host') {
      this.releaseHost(graphIds);
      return undefined;
    }
    const ending = graphIds.filter((id) => {
      const last = this.lastLevelByGraph.get(id) ?? levelIndex;
      if (last === levelIndex) return true;
      const provider = this.providers.get(id);
      return !provider || provider.TransactionDepth === 0;
    });
    return this.releaseGraphs(ending);
  }

  /** Release every remaining graph. Safe to call from `finally`. */
  async releaseAll(): Promise<Error | undefined> {
    if (this.mode === 'host') {
      this.hostHolder = undefined;
      return undefined;
    }
    return this.releaseGraphs([...this.providers.keys()]);
  }

  private releaseHost(graphIds: string[]): void {
    if (this.hostHolder !== undefined && graphIds.includes(this.hostHolder)) {
      this.hostHolder = undefined;
    }
  }

  private async releaseGraphs(ids: string[]): Promise<Error | undefined> {
    let settleError: Error | undefined;
    for (const id of ids) {
      const provider = this.providers.get(id);
      this.providers.delete(id);
      if (!provider) continue;

      const error = await this.settleAndRelease(id, provider);
      settleError ??= error;
    }
    return settleError;
  }

  /** Settle one independent instance, report the outcome, and always release it. */
  private async settleAndRelease(id: string, provider: GraphProviderLike): Promise<Error | undefined> {
    try {
      const outcome = await this.settle(provider);
      this.onGraphSettled?.(id, outcome);
      return undefined;
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.anyFailed = true;
      this.log(`Failed to settle graph ${id} transaction: ${error.message}`);
      await this.rollbackQuietly(provider);
      this.onGraphSettled?.(id, 'rolledBack');
      return error;
    } finally {
      try {
        await provider.ReleaseIndependentInstance();
      } catch {
        /* pool-safe: handle already dropped */
      }
    }
  }

  /**
   * Depth 0: every Save on this instance already committed. Leftover depth: commit it, or
   * roll it back explicitly when the file failed (do not rely on ReleaseIndependentInstance).
   */
  private async settle(provider: GraphProviderLike): Promise<GraphSettleOutcome> {
    if (provider.TransactionDepth === 0) {
      return 'committed';
    }
    if (this.anyFailed) {
      await provider.RollbackTransaction();
      return 'rolledBack';
    }
    await provider.CommitTransaction();
    return 'committed';
  }

  private async rollbackQuietly(provider: GraphProviderLike): Promise<void> {
    try {
      if (provider.TransactionDepth > 0) {
        await provider.RollbackTransaction();
      }
    } catch {
      /* still release */
    }
  }
}
