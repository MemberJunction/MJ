/**
 * Batching for {@link PostgreSQLTransactionGroup}'s submit — the pure, testable half.
 *
 * ## Why PostgreSQL cannot do what SQL Server does
 *
 * SQL Server's batch is simply the items' SQL concatenated: one request, many statements, many
 * result sets. PostgreSQL's *extended* protocol — the one any parameterized query uses — permits
 * exactly ONE statement per message, and node-postgres does not pipeline (its per-client queue
 * sends the next query only once the previous completes). So concatenation is not available, and
 * neither is "fire several and await together".
 *
 * Inlining the values as literals to reach the simple-query protocol would allow concatenation,
 * but it trades a parameterized call for hand-rolled quoting of every type the provider supports
 * (jsonb, timestamptz, bytea, arrays). That is a worse bargain than the round trips.
 *
 * ## What works instead
 *
 * Items whose instruction is the SAME SHAPE differ only in their parameter values, so they can be
 * combined into ONE statement:
 *
 * ```sql
 * SELECT 0 AS __mj_batch_item, x.* FROM (SELECT * FROM sp(p_a => $1)) AS x
 * UNION ALL
 * SELECT 1 AS __mj_batch_item, x.* FROM (SELECT * FROM sp(p_a => $2)) AS x
 * ORDER BY 1
 * ```
 *
 * One statement, still fully parameterized, the function invoked once per branch. `UNION ALL`
 * requires every branch to have the same column list, which is exactly what "same shape" buys —
 * and the wrapping subquery means the instruction itself is never parsed or rewritten beyond
 * renumbering its placeholders.
 *
 * ## Why shape is compared rather than assumed
 *
 * `GenerateSaveSQL` emits only the fields it is saving, so two updates to the same entity can
 * carry different argument lists. Grouping on the shape the provider actually produced — the
 * instruction with its `$n` placeholders normalized away — is the only test that cannot be
 * wrong. Groups of one fall back to being sent alone, which is exactly today's behaviour.
 */

/** Column carrying each branch's item index, so rows can be returned to their item. */
export const BATCH_INDEX_COLUMN = '__mj_batch_item';

/** One item's contribution: its rendered SQL and the values its `$n` placeholders refer to. */
export interface PgBatchableItem {
    Instruction: string;
    Params: unknown[];
}

/** A run of items that share a shape and can travel as one statement. */
export interface PgBatchGroup {
    /** Indexes into the ORIGINAL item array, so results can be routed back. */
    ItemIndexes: number[];
    SQL: string;
    Params: unknown[];
}

/**
 * Normalizes an instruction to its shape: placeholders erased, whitespace collapsed.
 *
 * `$1` and `$10` must both erase, and must not leave `0` behind — hence the digit-greedy match.
 */
export function ShapeOf(instruction: string): string {
    return instruction.replace(/\$\d+/g, '$?').replace(/\s+/g, ' ').trim();
}

/**
 * Groups CONSECUTIVE same-shape items. Order is preserved within and across groups, because the
 * items were queued in an order the caller may care about and nothing here is entitled to reorder
 * writes.
 */
export function GroupByShape(items: ReadonlyArray<PgBatchableItem>): number[][] {
    const groups: number[][] = [];
    let currentShape: string | null = null;
    for (let i = 0; i < items.length; i++) {
        const shape = ShapeOf(items[i].Instruction);
        if (shape === currentShape && groups.length > 0) {
            groups[groups.length - 1].push(i);
        } else {
            groups.push([i]);
            currentShape = shape;
        }
    }
    return groups;
}

/**
 * Builds the single statement for one group, renumbering every branch's placeholders into one
 * continuous `$n` sequence — one statement carries one parameter list, so a branch that kept its
 * original numbering would read another branch's values.
 *
 * A group of one is returned as the bare instruction: no wrapping, no index column, so the
 * single-item path stays byte-for-byte what it is today.
 */
export function BuildGroupSQL(items: ReadonlyArray<PgBatchableItem>, indexes: ReadonlyArray<number>): PgBatchGroup {
    if (indexes.length === 1) {
        const only = items[indexes[0]];
        return { ItemIndexes: [...indexes], SQL: only.Instruction, Params: [...only.Params] };
    }

    const params: unknown[] = [];
    const branches: string[] = [];
    for (const idx of indexes) {
        const item = items[idx];
        // Renumber this branch's placeholders to continue the global sequence. Map by ORIGINAL
        // number so a repeated placeholder ($1 used twice) stays a single parameter.
        const seen = new Map<number, number>();
        const rewritten = item.Instruction.replace(/\$(\d+)/g, (_m, digits: string) => {
            const original = Number(digits);
            let assigned = seen.get(original);
            if (assigned === undefined) {
                params.push(item.Params[original - 1]);
                assigned = params.length;
                seen.set(original, assigned);
            }
            return `$${assigned}`;
        });
        branches.push(`SELECT ${idx} AS ${BATCH_INDEX_COLUMN}, x.* FROM (${rewritten}) AS x`);
    }
    return {
        ItemIndexes: [...indexes],
        SQL: `${branches.join('\nUNION ALL\n')}\nORDER BY 1`,
        Params: params,
    };
}

/**
 * Splits a group's rows back to their items by the index column, dropping it from what the caller
 * sees so a row is indistinguishable from one the serial path returned.
 */
export function SplitGroupRows(
    rows: ReadonlyArray<Record<string, unknown>>,
    indexes: ReadonlyArray<number>,
): Map<number, Record<string, unknown>[]> {
    const out = new Map<number, Record<string, unknown>[]>();
    if (indexes.length === 1) {
        out.set(indexes[0], rows as Record<string, unknown>[]);
        return out;
    }
    for (const row of rows) {
        const idx = Number(row[BATCH_INDEX_COLUMN]);
        if (!Number.isFinite(idx)) continue;
        const { [BATCH_INDEX_COLUMN]: _drop, ...rest } = row;
        const bucket = out.get(idx);
        if (bucket) bucket.push(rest);
        else out.set(idx, [rest]);
    }
    return out;
}
