import { BaseEntity } from '@memberjunction/core';

/**
 * One row enrolled in a transaction group, paired with the label a user-facing message should use
 * for it — a user's email, "Add Integration". The caller owns the label because only the caller
 * knows what the row means on its screen.
 */
export interface EnrolledRow {
    label: string;
    entity: BaseEntity;
}

/**
 * The placeholder messages `GraphQLDataProvider` stamps onto EVERY item of a failed transaction
 * group, refused or not.
 *
 * It registers a `BaseEntityResult` on each entity *before* enrolling the row, and when the group
 * fails its transaction callback writes one of these onto that result — `'Transaction failed'` for
 * a Save, `'Transaction failed to commit'` for a Delete. So a row carrying one of these is a row
 * the server did **not** single out: it was accepted and then abandoned when a sibling was
 * refused. Only a row whose message says something else has a reason worth showing an operator.
 *
 * This is a deliberate coupling to two constants in a sibling package, and it is documented rather
 * than removed because there is no other signal that separates them. Both outcomes end up as
 * `Success: false` on `LatestResult`; `recordServerFailure` appends the server's reason only when
 * the server sent one, and appends nothing otherwise, which leaves the provider's placeholder as
 * the latest result. Keeping the knowledge in one place, pinned by a test, is the containment:
 * if the provider's wording changes, one test fails and one constant moves.
 */
const PROVIDER_PLACEHOLDER_MESSAGES: ReadonlySet<string> = new Set([
    'Transaction failed',
    'Transaction failed to commit',
]);

/**
 * The reasons the SERVER gave for the rows it refused, one line per row that carries one.
 *
 * Issue #4309 fixed the server half of this: `ExecuteTransactionGroup` now reports which rows it
 * refused, and `GraphQLTransactionGroup.recordServerFailure` copies each reason onto that item's
 * `BaseEntity.LatestResult`. This is the last hop — without it the reason reaches the entity and
 * stops there, and every caller falls back to its own generic "rolled back" sentence, which is
 * what #4309's "Verify by" rules out.
 *
 * Returns empty when the server named no row. That is a real outcome, not a failure of this
 * function: a transport error or a rollback the server could not attribute to one item leaves
 * nothing worth showing, and the caller should keep its generic message rather than invent detail.
 */
export function serverRefusalReasons(rows: EnrolledRow[]): string[] {
    const lines: string[] = [];
    for (const row of rows) {
        const reason = row.entity.LatestResult?.CompleteMessage?.trim();
        if (reason && !PROVIDER_PLACEHOLDER_MESSAGES.has(reason)) {
            lines.push(`${row.label}: ${reason}`);
        }
    }
    return lines;
}
