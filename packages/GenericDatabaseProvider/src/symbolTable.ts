import type { SQLParserDialect } from '@memberjunction/sql-dialect';

/**
 * Symbol table for managing CTE names during composition.
 *
 * Guarantees uniqueness at CTE creation time — name collisions become
 * impossible by construction.
 *
 * All name comparisons are case-insensitive (SQL Server and PostgreSQL
 * both treat unquoted identifiers case-insensitively for CTEs).
 */
export class SymbolTable {
    /** Allocated names (canonical lowercase → original casing) */
    private allocatedNames = new Map<string, string>();

    /** Dialect for identifier quoting */
    private dialect: SQLParserDialect;

    constructor(dialect: SQLParserDialect) {
        this.dialect = dialect;
    }

    /**
     * Registers a name. If the name is already taken, generates a unique
     * suffix (`Name__2`, `Name__3`, ...) and returns the suffixed version.
     *
     * @param desiredName - The preferred name (unquoted)
     * @returns The actual allocated name (may be suffixed if collision)
     */
    Register(desiredName: string): string {
        const canonical = desiredName.toLowerCase();

        if (!this.allocatedNames.has(canonical)) {
            this.allocatedNames.set(canonical, desiredName);
            return desiredName;
        }

        // Collision — find a fresh name
        let suffix = 2;
        let candidate = `${desiredName}__${suffix}`;
        while (this.allocatedNames.has(candidate.toLowerCase())) {
            suffix++;
            candidate = `${desiredName}__${suffix}`;
        }
        this.allocatedNames.set(candidate.toLowerCase(), candidate);
        return candidate;
    }

    /**
     * Pre-seeds the table with names that are already taken (e.g., outer CTE names).
     */
    Seed(name: string): void {
        const canonical = name.toLowerCase();
        if (this.allocatedNames.has(canonical)) {
            return; // Already seeded — idempotent
        }
        this.allocatedNames.set(canonical, name);
    }

    /**
     * Checks if a name (case-insensitive) is already allocated.
     */
    Has(name: string): boolean {
        return this.allocatedNames.has(name.toLowerCase());
    }

    /**
     * Returns the dialect-quoted form of a name via `dialect.QuoteIdentifier()`.
     */
    Quote(name: string): string {
        return this.dialect.QuoteIdentifier(name);
    }

    /**
     * Generates a composition CTE name from a query name + hash, registers it,
     * and returns the quoted form.
     */
    RegisterCompositionCTE(queryName: string, hashInput: string): string {
        const sanitized = queryName
            .replace(/[^a-zA-Z0-9_ ]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 50);

        const hash = simpleHash(hashInput);
        const desired = `__cte_${sanitized}_${hash}`;
        const actual = this.Register(desired);
        return this.Quote(actual);
    }

    /**
     * Returns the current count of allocated names.
     */
    get Size(): number {
        return this.allocatedNames.size;
    }
}

/**
 * Simple string hash for generating short, deterministic suffixes.
 */
function simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 6);
}
