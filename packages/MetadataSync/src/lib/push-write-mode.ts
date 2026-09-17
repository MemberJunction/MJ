/**
 * @fileoverview How `mj sync push` writes creates and updates.
 * @module push-write-mode
 *
 * - `atomic` (default): every save runs on the host provider inside the push transaction, one
 *   JSON-root graph at a time. A failure anywhere rolls back everything the push wrote.
 * - `parallel` (`--no-atomic`, or `push.atomic: false` in the root `.mj-sync.json`): sibling
 *   graphs run in parallel on independent provider instances. Each save commits on its own, so
 *   a failure does NOT roll back creates and updates that already ran.
 */

export type PushWriteMode = 'atomic' | 'parallel';

/** Default number of JSON-root graphs run at once in parallel mode. */
export const DEFAULT_PARALLEL_BATCH_SIZE = 10;

export interface PushWriteModeInput {
  /** CLI `--atomic` / `--no-atomic`. Undefined when the flag was not passed. */
  atomicFlag?: boolean;
  /** `push.atomic` from the root `.mj-sync.json`. */
  configAtomic?: boolean;
  /** CLI `--parallel-batch-size`. Undefined when the flag was not passed. */
  parallelBatchSize?: number;
}

export interface PushWritePlan {
  mode: PushWriteMode;
  /** Graphs run at once. Always 1 in atomic mode. */
  graphBatchSize: number;
  /** Where the mode came from, for the log line. */
  source: 'flag' | 'config' | 'default';
  /** Warnings to show the user about how the inputs were combined. */
  warnings: string[];
}

/** The flag wins over the config, and atomic is the default. */
export function resolvePushWritePlan(input: PushWriteModeInput): PushWritePlan {
  const { atomic, source } = pickAtomic(input);
  const warnings: string[] = [];

  if (atomic) {
    const size = input.parallelBatchSize;
    if (size !== undefined && size !== 1) {
      warnings.push(
        `--parallel-batch-size=${size} is ignored: this push is atomic, so records are saved one graph at a time ` +
          `in a single transaction. Pass --no-atomic to run graphs in parallel without rollback.`
      );
    }
    return { mode: 'atomic', graphBatchSize: 1, source, warnings };
  }

  const graphBatchSize = input.parallelBatchSize ?? DEFAULT_PARALLEL_BATCH_SIZE;
  return { mode: 'parallel', graphBatchSize, source, warnings };
}

function pickAtomic(input: PushWriteModeInput): { atomic: boolean; source: PushWritePlan['source'] } {
  if (input.atomicFlag !== undefined) {
    return { atomic: input.atomicFlag, source: 'flag' };
  }
  if (input.configAtomic !== undefined) {
    return { atomic: input.configAtomic, source: 'config' };
  }
  return { atomic: true, source: 'default' };
}

/** The warning printed at the start of every non-atomic push that writes to the database. */
export function parallelModeWarning(graphBatchSize: number): string {
  return (
    `Non-atomic push (${graphBatchSize} graphs in parallel): each create and update is committed as soon as it is saved. ` +
    `If the push fails, those records stay in the database. Only deletes and deferred records are rolled back.`
  );
}
