/**
 * @fileoverview How `mj sync push` writes the creates and updates of one entity directory.
 * @module push-write-mode
 *
 * - `shared` (default): every save runs on the host provider inside the push transaction, one
 *   JSON-root graph at a time. A failure anywhere rolls back everything that directory wrote,
 *   along with every other shared directory in the push.
 * - `isolated` (`isolatedTransactions: true`, or `--isolated-transactions`): sibling graphs run in
 *   parallel, each on its own provider instance and therefore its own connection and transaction.
 *   Each save commits on its own, so a failure does NOT roll those creates and updates back.
 *
 * Isolation is chosen **per entity directory**, because entities differ: metadata is simple and
 * wants atomicity, while an entity that manages its own transaction scopes (an order with journal
 * entries and payments) may want the parallelism. It cannot be finer than a directory: mixing the
 * host connection with per-graph connections inside one file is the deadlock the graph pool exists
 * to prevent.
 */

/** How one entity directory's creates and updates are written. */
export type PushWriteMode = 'shared' | 'isolated';

/** Default number of JSON-root graphs run at once in an isolated directory. */
export const DEFAULT_PARALLEL_BATCH_SIZE = 10;

export interface PushWriteModeInput {
  /** CLI `--isolated-transactions` / `--no-isolated-transactions`. Undefined when not passed. */
  isolatedFlag?: boolean;
  /** `push.isolatedTransactions` from this directory's `.mj-sync.json`. */
  entityIsolated?: boolean;
  /** `push.isolatedTransactions` from the root `.mj-sync.json`. */
  rootIsolated?: boolean;
}

/** Where a directory's mode came from, for the log line. */
export type PushWriteModeSource = 'flag' | 'entity' | 'root' | 'default';

export interface PushDirectoryMode {
  mode: PushWriteMode;
  source: PushWriteModeSource;
}

/**
 * The mode for one entity directory. The CLI flag wins over every file, so a run can force either
 * mode without editing metadata; then the directory's own config, then the root's, then shared.
 */
export function resolveDirectoryMode(input: PushWriteModeInput): PushDirectoryMode {
  if (input.isolatedFlag !== undefined) {
    return { mode: input.isolatedFlag ? 'isolated' : 'shared', source: 'flag' };
  }
  if (input.entityIsolated !== undefined) {
    return { mode: input.entityIsolated ? 'isolated' : 'shared', source: 'entity' };
  }
  if (input.rootIsolated !== undefined) {
    return { mode: input.rootIsolated ? 'isolated' : 'shared', source: 'root' };
  }
  return { mode: 'shared', source: 'default' };
}

/** Graphs to run at once in a directory of this mode. */
export function graphBatchSizeFor(mode: PushWriteMode, parallelBatchSize?: number): number {
  return mode === 'isolated' ? parallelBatchSize ?? DEFAULT_PARALLEL_BATCH_SIZE : 1;
}

/** The warning shown once per push that writes any isolated directory to the database. */
export function isolatedModeWarning(directories: string[], graphBatchSize: number): string {
  const list = directories.join(', ');
  return (
    `Isolated transactions (${graphBatchSize} graphs in parallel) for: ${list}. ` +
    `Each create and update in those directories is committed as soon as it is saved. If the push fails, ` +
    `those records stay in the database; only the shared directories, the deletes and the deferred records roll back.`
  );
}

/** Told once when `--parallel-batch-size` cannot apply, so the flag does not look effective. */
export function unusedBatchSizeWarning(size: number): string {
  return (
    `--parallel-batch-size=${size} is ignored: no entity directory in this push uses isolated transactions, ` +
    `so records are saved one graph at a time in a single transaction. ` +
    `Set push.isolatedTransactions on an entity's .mj-sync.json, or pass --isolated-transactions, to run graphs in parallel.`
  );
}
