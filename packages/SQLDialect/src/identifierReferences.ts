/**
 * Identifier-reference detection for SQL fragments.
 *
 * Lives in `sql-dialect` rather than `MJGlobal` deliberately. This is SQL semantics, and this
 * package is where SQL semantics belong — co-located with {@link SQLDialect} and its drivers, so
 * the day this needs to become dialect-aware it evolves in place instead of moving packages or
 * adding a dependency. `MJGlobal` is the foundational utility package with no SQL surface, and
 * every consumer that could want this (MJCore, MJServer, MJCoreEntitiesServer, both data
 * providers, SQLParser) already depends on `sql-dialect`.
 */

/** Escapes regex metacharacters so a field name is matched literally, never as a pattern. */
function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds which of the supplied identifier names are referenced anywhere in a SQL fragment.
 *
 * Built for field-level security, where an `ExtraFilter` or `OrderBy` naming a field the user
 * cannot read must be rejected: output stripping alone is security theater, because
 * `ExtraFilter: "Salary > 200000"` reconstructs the values from the returned row set without the
 * column ever appearing in a result.
 *
 * ## Deliberately conservative
 *
 * String literals are NOT stripped, `[bracketed]` / `"quoted"` / `` `backticked` `` identifiers
 * match the same as bare ones, and a match inside a comment still counts. A false positive (a
 * string literal that happens to contain a restricted field's name) rejects a legitimate query
 * and is recoverable — the caller sees an error and rewrites. A false negative silently leaks the
 * data the whole feature exists to protect. For a security gate that trade is not close.
 *
 * ## Direction matters, and getting it backwards is a silent leak
 *
 * We search for each supplied NAME inside the fragment; we do NOT tokenize the fragment and look
 * tokens up. Tokenizing forces an identifier character class (`[A-Z_][A-Z0-9_]*`), and every
 * field name outside that class then becomes unmatchable and silently permitted — `Base Salary`,
 * `Salary%`, and `Salário` all sailed through an earlier tokenizing version. Column names come
 * from the database, so none of those shapes can be assumed away.
 *
 * ## Why there is no `dialect` parameter
 *
 * Not an oversight, and not a barrier to adding Oracle or any other dialect. Each way dialects
 * differ here is either already handled or provably safe:
 *
 * - **Quoting delimiters** — SQL Server `[x]`, PostgreSQL/Oracle `"x"`, MySQL `` `x` ``. Handled
 *   for all of them without knowing which: delimiters are not word characters, so the
 *   lookarounds below treat a quoted reference exactly like a bare one.
 * - **Case folding** — PostgreSQL folds unquoted identifiers to lower, Oracle to UPPER, SQL
 *   Server compares per collation. Matching case-insensitively is a strict SUPERSET of every one
 *   of those rules, so it can never MISS a reference any dialect would resolve. Dialect awareness
 *   could only make this narrower (fewer false positives), never safer.
 * - **Comment and string-literal syntax** — irrelevant, because neither is stripped.
 *
 * A `dialect` enum parameter would in fact be the thing that obstructs a new dialect: it forces
 * every caller to thread a value through and forces this file to be revisited per dialect, in
 * exchange for behavior that is already correct. If dialect-specific identifier handling is ever
 * genuinely needed, the seam belongs on the {@link SQLDialect} driver (which already exposes
 * `PlatformKey` / `QuoteIdentifier`) and the caller — `ProviderBase` already knows its own
 * platform — passes the normalized form in. That evolution needs no change here.
 *
 * KNOWN EDGE, recorded rather than hidden: a field name containing a quoting delimiter (a column
 * literally named ``Sal]ary`` or ``Sal"ary``) is escaped by doubling inside a quoted reference
 * (`[Sal]]ary]`, `"Sal""ary"`), which this literal search would not match. That IS dialect-
 * specific and would need the driver seam above. It requires a column name containing a bracket
 * or double quote, which CodeGen-generated MJ entities do not produce.
 *
 * @param expression The SQL fragment to scan (a WHERE predicate, ORDER BY clause, etc.)
 * @param identifiers Candidate identifier names, matched case-insensitively
 * @returns The subset of `identifiers` referenced, in their original casing, deduplicated.
 *          Empty when `expression` is blank or nothing matches.
 */
export function FindReferencedIdentifiers(expression: string, identifiers: Iterable<string>): string[] {
    const candidates = new Map<string, string>();
    for (const name of identifiers) {
        const normalized = name?.trim();
        if (normalized) candidates.set(normalized.toLowerCase(), name);
    }
    if (!expression || typeof expression !== 'string' || candidates.size === 0) {
        return [];
    }

    // One pass over the fragment for all candidates. Longest-first so that when one name is a
    // prefix of another (`Salary` and `Salary Band`), the longer alternative is preferred and the
    // reported hit is the specific field rather than an accidental shorter one.
    const names = [...candidates.keys()].sort((a, b) => b.length - a.length);
    const alternation = names.map(escapeRegex).join('|');
    // Word-character lookarounds rather than \b: \b is defined relative to \w and misbehaves for
    // names whose first or last character is not a word character (`Salary%`, `[Base Salary]`).
    const pattern = new RegExp(`(?<![A-Za-z0-9_])(${alternation})(?![A-Za-z0-9_])`, 'gi');

    const found = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(expression)) !== null) {
        const original = candidates.get(match[1].trim().toLowerCase());
        if (original !== undefined) {
            found.add(original);
        }
        // Zero-length matches are impossible (empty names are filtered above), so exec's
        // lastIndex always advances and this loop always terminates.
    }
    return [...found];
}
