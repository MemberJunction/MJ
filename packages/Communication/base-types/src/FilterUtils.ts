/**
 * Query-clause composition for MemberJunction Communication providers.
 *
 * Every provider that narrows a message read builds a provider-specific query string — an OData
 * `$filter` for MS Graph, a search expression for Gmail — and each had independently grown the same
 * defect: a clause for `UnreadOnly`, followed by an UNCONDITIONAL reassignment from the
 * provider-specific escape hatch (`ContextData.Filter`, `ContextData.query`). Passing both silently
 * discarded the first, so a caller asking for unread mail received read mail and had no way to tell.
 *
 * The fix is composition rather than assignment, and it lives here rather than in each provider so
 * the next provider inherits it instead of re-deriving it.
 *
 * Dependency-free ON PURPOSE. It sits alongside `AddressUtils` for the same reason: provider test
 * suites mock `@memberjunction/communication-types` wholesale, and a pure module can be pulled in
 * with `vi.importActual` so those tests exercise the real composition instead of a stub that agrees
 * with whatever the test expects.
 *
 * @module @memberjunction/communication-types
 */

/**
 * Join the clauses that are actually present with `operator`, dropping the ones that are not.
 *
 * Absent means null, undefined, empty, or whitespace — all four occur naturally when a clause is
 * built conditionally, and none of them should contribute an empty term to the query. Returns ''
 * when nothing survives, which every caller can hand to its client unchanged.
 *
 * The operator is supplied by the caller because the syntaxes genuinely differ: Graph wants
 * `' and '`, while Gmail joins search terms with a bare space that it reads as an implicit AND.
 * Clauses are NOT parenthesised here — a caller whose operator needs grouping should parenthesise
 * its own clauses, which is what the Graph provider does.
 */
export function CombineFilterClauses(clauses: (string | null | undefined)[], operator: string): string {
    const kept = clauses.map((c) => (c ?? '').trim()).filter((c) => c.length > 0);
    return kept.length === 0 ? '' : kept.join(operator);
}
