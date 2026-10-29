/**
 * Safety rules for dropping a staging database. A staging name reaches the drop actions as a plain
 * string, so every drop is checked against the databases it must never touch: the system databases,
 * the database the server itself runs on, a database created before the job's restore began, and —
 * for the free-standing drop paths — any name outside the staging prefix.
 */

/** The prefix every staging database the archive seed creates carries. */
export const STAGING_DATABASE_PREFIX = 'MJ_Staging_';

/** System databases a staging drop never touches (lower-cased). */
const SYSTEM_DATABASES: ReadonlySet<string> = new Set(['master', 'model', 'msdb', 'tempdb']);

/** A drop refused by a safety rule; the drop paths report it as `DROP_REFUSED`. */
export class StagingDropRefusedError extends Error {
    public readonly ResultCode = 'DROP_REFUSED';

    constructor(message: string) {
        super(message);
        this.name = 'StagingDropRefusedError';
    }
}

/** Optional restrictions on one staging drop. */
export interface StagingDropOptions {
    /** Refuse unless the database was created at or after this instant (the job's restore start). */
    CreatedAfter?: Date;
}

/** What the server reports about the database a drop targets. */
export interface StagingDropFacts {
    /** `DB_NAME()` of the connection the drop runs on. */
    CurrentDatabase: string;
    /** `sys.databases.create_date` in UTC; null when the database does not exist. */
    CreatedAtUtc: Date | null;
}

/** Throws when `name` is a system database (compared case-insensitively). */
/** True when `name` is a system database (compared case-insensitively). */
export function IsSystemDatabase(name: string): boolean {
    return SYSTEM_DATABASES.has(name.trim().toLowerCase());
}

export function AssertNotSystemDatabase(name: string): void {
    if (SYSTEM_DATABASES.has(name.trim().toLowerCase())) {
        throw new StagingDropRefusedError(`Refusing to drop [${name}]: it is a system database.`);
    }
}

/**
 * Throws unless `name` starts with {@link STAGING_DATABASE_PREFIX} (case-insensitively). `allowAnyName`
 * lifts the rule for an operator who deliberately drops another name, but only together with
 * `createdAfter`: without it, a caller could drop any database the server's login may drop. The archive
 * seed job never sets `allowAnyName`. A system database is refused first, whatever the flags.
 */
export function AssertStagingDatabaseName(name: string, allowAnyName: boolean, createdAfter?: Date): void {
    AssertNotSystemDatabase(name);
    if (name.toLowerCase().startsWith(STAGING_DATABASE_PREFIX.toLowerCase())) {
        return;
    }
    if (!allowAnyName) {
        throw new StagingDropRefusedError(
            `Refusing to drop [${name}]: a staging database name starts with '${STAGING_DATABASE_PREFIX}'. Pass AllowAnyName='true' with CreatedAfter to drop another database.`
        );
    }
    if (!createdAfter) {
        throw new StagingDropRefusedError(
            `Refusing to drop [${name}]: AllowAnyName requires CreatedAfter, so only a database created after that instant can be dropped.`
        );
    }
}

/**
 * Throws when the facts rule the drop out: the target is the current database, or it was created
 * before `options.CreatedAfter`. A database that does not exist passes (the drop is then a no-op).
 */
export function AssertDropAllowedByFacts(name: string, facts: StagingDropFacts, options: StagingDropOptions): void {
    if (facts.CurrentDatabase.trim().toLowerCase() === name.trim().toLowerCase()) {
        throw new StagingDropRefusedError(`Refusing to drop [${name}]: it is the database this server runs on.`);
    }
    if (facts.CreatedAtUtc && options.CreatedAfter && facts.CreatedAtUtc.getTime() < options.CreatedAfter.getTime()) {
        throw new StagingDropRefusedError(
            `Refusing to drop [${name}]: it was created at ${facts.CreatedAtUtc.toISOString()}, before the restore that would have created it began (${options.CreatedAfter.toISOString()}).`
        );
    }
}
