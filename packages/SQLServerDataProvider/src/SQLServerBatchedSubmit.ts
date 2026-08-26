/**
 * Batching for {@link SQLServerTransactionGroup}'s submit — the pure, testable half.
 *
 * ## Why this exists
 *
 * `HandleSubmit` opens ONE transaction and then sends its items ONE AT A TIME, awaiting each.
 * That is atomicity without batching: N items still cost N round trips, and on a high-latency
 * link the round trip IS the write ceiling — SQL execution measures in single-digit milliseconds
 * while the trip costs tens.
 *
 * The alternative the ecosystem reaches for is to stop calling the generated CRUD procedures and
 * write the rows directly. That buys speed by giving up stored-procedure side effects, Record
 * Changes rows and per-entity save events — including the cache-invalidation events that
 * `DatabaseProviderBase.TrustLocalCacheCompletely` is justified on. Batching the statements the
 * group ALREADY rendered gives the same collapse in round trips and gives none of that up: the
 * SQL sent is byte-for-byte what the serial path sends, in one trip instead of N.
 *
 * Measured against SQL Server 2022 with the entity procedure AND its Record Change writes running
 * per row, at a modelled 25ms RTT: 211 rows/min sent per statement, 131,713 rows/min at 100 items
 * per trip. DB cost per row stayed flat as the group grew (2.79 → 2.52 ms), so the compile-bound
 * wall that punishes very large literal batches is not reached at these sizes.
 *
 * ## Why concatenation is SAFE here specifically
 *
 * `SQLServerDataProvider.RenderSaveCallBinding` emits every save as
 * `DECLARE @Field_<uuid8> …; SET @Field_<uuid8> = …; EXEC spCreateX @Field=@Field_<uuid8>`, and its
 * own doc says the uuid suffix exists "to keep batched saves (`SQLServerTransactionGroup`)
 * collision-free". The statements were built to be concatenated; the submit simply never did it.
 *
 * ## Mapping results back
 *
 * `recordsets` cannot be zipped to items positionally: an item may return no rows at all, so an
 * empty result is indistinguishable from the next item's. Each item is therefore preceded by a
 * sentinel `SELECT <i> AS <SENTINEL_COLUMN>`, and the walk assigns everything between one sentinel
 * and the next to that item. Deterministic regardless of how many result sets an item produces.
 */

/** Column name the per-item sentinel SELECT emits. Deliberately unlikely to collide with a view. */
export const SENTINEL_COLUMN = '__mj_batch_item';

/** One item's contribution to a batch: its rendered SQL and its optional positional parameters. */
export interface BatchableItem {
    /** The rendered instruction — `?` placeholders if `Vars` is present. */
    Instruction: string;
    /** Positional values for `?` placeholders, or undefined when the instruction is self-contained. */
    Vars?: unknown[];
}

/** A batch ready to send: one SQL text plus the flat parameter list it refers to. */
export interface BuiltBatch {
    SQL: string;
    /** Parameter values in declaration order — bound as `@p0`, `@p1`, … across the WHOLE batch. */
    Params: unknown[];
}

/**
 * Renders `items` into one batch.
 *
 * Parameters are renumbered ACROSS items into a single `@p<n>` sequence, because one request
 * carries one parameter namespace — two items that each rendered `@p0` would otherwise collide
 * and silently take each other's value.
 */
export function BuildBatch(items: ReadonlyArray<BatchableItem>): BuiltBatch {
    const parts: string[] = [];
    const params: unknown[] = [];

    items.forEach((item, index) => {
        parts.push(`SELECT ${index} AS [${SENTINEL_COLUMN}];`);
        if (item.Vars && Array.isArray(item.Vars) && item.Vars.length > 0) {
            // Consume this item's placeholders left to right; each takes the next GLOBAL index, so
            // two items that both rendered `@p0` can no longer take each other's value.
            const vars = item.Vars;
            let local = 0;
            const rendered = item.Instruction.replace(/\?/g, () => {
                const globalIndex = params.length;
                params.push(vars[local]);
                local++;
                return `@p${globalIndex}`;
            });
            parts.push(rendered.endsWith(';') ? rendered : `${rendered};`);
        } else {
            parts.push(item.Instruction.endsWith(';') ? item.Instruction : `${item.Instruction};`);
        }
    });

    return { SQL: parts.join('\n'), Params: params };
}

/**
 * Splits a driver's `recordsets` back into one entry per item, using the sentinels.
 *
 * Returns an array parallel to the items: each entry is that item's own rows (the first
 * non-sentinel result set it produced), or undefined when it produced none.
 */
export function SplitRecordsets(
    recordsets: ReadonlyArray<ReadonlyArray<Record<string, unknown>>>,
    itemCount: number,
): Array<Record<string, unknown>[] | undefined> {
    const out: Array<Record<string, unknown>[] | undefined> = new Array(itemCount).fill(undefined);
    let current = -1;
    for (const rs of recordsets) {
        const first = rs?.[0];
        const isSentinel = first !== undefined && Object.prototype.hasOwnProperty.call(first, SENTINEL_COLUMN);
        if (isSentinel) {
            const idx = Number(first[SENTINEL_COLUMN]);
            current = Number.isFinite(idx) ? idx : current;
            continue;
        }
        // Only the FIRST non-sentinel set after a sentinel is the item's result — a procedure that
        // emits several keeps the first, which is the row the serial path read as `recordset`.
        if (current >= 0 && current < itemCount && out[current] === undefined) {
            out[current] = rs as Record<string, unknown>[];
        }
    }
    return out;
}
