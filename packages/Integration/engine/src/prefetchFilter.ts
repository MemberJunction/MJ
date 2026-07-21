/**
 * Builds the WHERE filter for the content-hash prefetch (`IntegrationEngine.PrefetchContentHashes`)
 * — the bulk stored-hash lookup that powers the idempotent-skip fast path.
 *
 * Both the PK identifier(s) AND the value literals are quoted through the provider's SQL dialect.
 * Quoting the IDENTIFIER is the fix for MJ#3047: an integration object whose PK column name is a SQL
 * reserved word (e.g. Zendesk `custom_objects.key`) otherwise yields `WHERE key IN (...)`, which the
 * database rejects. `PrefetchContentHashes` swallows that error (best-effort), so the prefetch returns
 * empty and the content-hash idempotency skip can never engage — every unchanged record is re-written
 * on each sync. Dialect-aware quoting (SQL Server `[key]`, PostgreSQL `"key"`) keeps it valid on both
 * targets, so it does NOT reintroduce the "SS brackets break Postgres" problem that motivated the
 * previous (unsafe) unquoted form.
 */

/** The minimal dialect surface this builder needs; satisfied by `DatabaseProviderBase.Dialect` (SQLDialect). */
export interface SqlQuoter {
    QuoteIdentifier(name: string): string;
    QuoteStringLiteral(value: string): string;
}

/**
 * @param pkNames the entity's primary-key field name(s), in `PrimaryKeys` order.
 * @param ids     the `MatchedMJRecordID` values — a single value per record for a single PK, or the
 *                `'|'`-joined composite key ("v1|v2|…") in `PrimaryKeys` order for a composite PK.
 * @param q       the provider's dialect (identifier + string-literal quoting).
 * @returns a dialect-safe `ExtraFilter` string for the prefetch RunView.
 */
export function buildContentHashPrefetchFilter(pkNames: string[], ids: string[], q: SqlQuoter): string {
    if (pkNames.length === 1) {
        // Single-PK fast path: WHERE [pk] IN (...).
        const inList = ids.map(id => q.QuoteStringLiteral(String(id))).join(',');
        return `${q.QuoteIdentifier(pkNames[0])} IN (${inList})`;
    }
    // Composite-PK: each MatchedMJRecordID is "v1|v2|..." in PrimaryKeys order. Build an OR of
    // per-record (pk1 = 'v1' AND pk2 = 'v2') clauses — bounded by batch size upstream.
    return ids.map(mid => {
        const parts = String(mid).split('|');
        return '(' + pkNames.map((name, i) =>
            `${q.QuoteIdentifier(name)} = ${q.QuoteStringLiteral(String(parts[i] ?? ''))}`).join(' AND ') + ')';
    }).join(' OR ');
}
