/**
 * @fileoverview Reconciling a changed parent's children against a fresh split.
 *
 * Re-running a split produces a new set of blocks. Deleting every existing child and recreating
 * them would lose their identity — and with it their chunks, their vectors and their history — so
 * the new blocks are matched against what is already there.
 *
 * Matching is **by URL**, used as an effectively unique identifier for a source-and-location
 * combination even where it is not a literal URL. The one hard requirement this places on a
 * splitting reader is that the identifier it assigns each child must be stable across re-runs. A
 * separate `DisplayLink` field carries where a user should be sent, so reusing `URL` for
 * reconciliation identity does not conflict with display.
 *
 * @module @memberjunction/content-pipeline
 */

/** An existing child, as far as reconciliation cares. */
export interface ExistingChild {
    /** The child's primary key. */
    RecordID: string;
    /** The child's reconciliation identity. */
    URL: string;
}

/** A block the fresh split produced. */
export interface ProducedBlock {
    /** The block's reconciliation identity, derived from its stable key. */
    URL: string;
}

/** What to do with the current set of children. */
export interface ReconciliationPlan<TBlock extends ProducedBlock> {
    /** Blocks that match an existing child: update in place and reset it recursively. */
    Update: { RecordID: string; Block: TBlock }[];
    /** Blocks with no existing match: create fresh. */
    Create: TBlock[];
    /** Children whose block no longer exists: delete, along with their chunks and nested children. */
    Delete: ExistingChild[];
}

/**
 * Work out what a re-split means for a parent's existing children.
 *
 * Pure: it reads nothing and writes nothing, so the decision can be tested and reviewed without a
 * database, and the caller stays in control of the order the writes happen in.
 *
 * @example
 * ```ts
 * const plan = ReconcileChildren(existing, blocks);
 * // plan.Update → update in place, then reset each recursively
 * // plan.Create → new child records
 * // plan.Delete → remove, with their chunks and nested children
 * ```
 */
export function ReconcileChildren<TBlock extends ProducedBlock>(
    existing: readonly ExistingChild[],
    produced: readonly TBlock[],
): ReconciliationPlan<TBlock> {
    const byURL = new Map(existing.map((child) => [child.URL, child]));
    const matched = new Set<string>();
    const plan: ReconciliationPlan<TBlock> = { Update: [], Create: [], Delete: [] };

    for (const block of produced) {
        const child = byURL.get(block.URL);
        if (child) {
            plan.Update.push({ RecordID: child.RecordID, Block: block });
            matched.add(child.URL);
        } else {
            plan.Create.push(block);
        }
    }

    for (const child of existing) {
        if (!matched.has(child.URL)) {
            plan.Delete.push(child);
        }
    }
    return plan;
}

/**
 * Whether re-discovered content actually changed.
 *
 * A checksum comparison, kept here so both the caller that re-discovers and the caller that
 * reconciles agree on what "unchanged" means. Unchanged content is a no-op: only a genuine change
 * re-enters the pipeline.
 */
export function HasContentChanged(storedChecksum: string | null, freshChecksum: string | null): boolean {
    // An unknown checksum on either side cannot prove sameness, so the safe answer is "changed" —
    // reprocessing something unnecessarily costs a run; skipping a real change costs correctness.
    if (!storedChecksum || !freshChecksum) {
        return true;
    }
    return storedChecksum !== freshChecksum;
}
