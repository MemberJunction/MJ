/**
 * Name similarity utilities for organic key cluster detection.
 *
 * Operates purely on column/identifier names with no external dependencies. Provides
 * the baseline signal that lets DBAutoDoc detect organic key clusters without
 * requiring any AI provider — the embedding signal layers on top when available.
 */

/**
 * Tokenize an identifier into lowercase normalized tokens.
 *
 * Handles:
 *   - camelCase / PascalCase (BusinessEntityID → ['business', 'entity', 'id'])
 *   - snake_case (business_entity_id → ['business', 'entity', 'id'])
 *   - SCREAMING_SNAKE_CASE
 *   - kebab-case
 *   - Mixed separators (Customer.Email_Address → ['customer', 'email', 'address'])
 *   - Acronyms (HTTPRequest → ['http', 'request'])
 */
export function tokenize(identifier: string): string[] {
    if (!identifier) return [];

    // Step 1: replace explicit separators with spaces
    let normalized = identifier.replace(/[_\-.\s/\\]+/g, ' ');

    // Step 2: split on camelCase / PascalCase boundaries
    //  - lowercase→uppercase boundary: "businessEntity" → "business Entity"
    //  - acronym boundary: "HTTPRequest" → "HTTP Request"
    normalized = normalized.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    normalized = normalized.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

    return normalized
        .split(/\s+/)
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);
}

/**
 * Jaccard similarity over two token sets: |A ∩ B| / |A ∪ B|.
 * Returns a value in [0, 1] where 1.0 means identical sets and 0.0 means disjoint.
 */
export function tokenJaccard(a: string, b: string): number {
    const tokensA = new Set(tokenize(a));
    const tokensB = new Set(tokenize(b));
    if (tokensA.size === 0 && tokensB.size === 0) return 0;
    let intersection = 0;
    for (const token of tokensA) {
        if (tokensB.has(token)) intersection++;
    }
    const union = tokensA.size + tokensB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

/**
 * Convenience: distance = 1 - jaccard. Useful for combining with other distance metrics.
 */
export function tokenJaccardDistance(a: string, b: string): number {
    return 1 - tokenJaccard(a, b);
}

/**
 * Compute Jaccard similarity over two columns' full identifier paths.
 * Includes schema/table tokens so e.g. Sales.Customer.Email and Vendor.Email
 * are distinguished from same-named columns within the same table.
 */
export function columnNameJaccard(
    a: { schema: string; table: string; column: string },
    b: { schema: string; table: string; column: string },
): number {
    return tokenJaccard(
        `${a.schema} ${a.table} ${a.column}`,
        `${b.schema} ${b.table} ${b.column}`,
    );
}

/**
 * Column-name similarity that weights the column-name match more than the schema/table.
 * Returns Jaccard over the column name itself, with a small boost when schema/table also match.
 * Used as the primary name-similarity signal in the hybrid distance metric.
 */
export function weightedColumnNameSimilarity(
    a: { schema: string; table: string; column: string },
    b: { schema: string; table: string; column: string },
): number {
    const columnSim = tokenJaccard(a.column, b.column);
    if (columnSim === 0) return 0;
    // Small boost when both columns ALSO share schema/table tokens — but we don't want
    // intra-table column matches to dominate (typically organic keys span tables).
    const contextSim = tokenJaccard(`${a.schema} ${a.table}`, `${b.schema} ${b.table}`);
    return Math.min(1.0, columnSim + 0.1 * contextSim);
}
