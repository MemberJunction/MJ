/**
 * db-guard.ts — names the database a run will use, and refuses one that does not look like a
 * development or clean-room database.
 *
 * The rig connects to whatever `mj.config.cjs` or the repo-root `.env` names. A live run writes
 * `MJ: AI Prompt Runs` rows there, spends model budget, and sends the `--text-fields` of that
 * database's records to outside model vendors. On a checkout pointed at a production database, that
 * is its records' text leaving the machine. So the rig prints the target (never its credentials) and
 * runs only against a database whose name carries a word such as `dev`, `test` or `clean`, unless
 * `--allow-db <that database's name>` says the operator means it. No rig in this package had a guard
 * like this, so it is kept small and pure.
 */

/** Where a run connects: enough to name it, never its credentials. */
export interface DatabaseTarget {
    Host: string;
    Port: number;
    Database: string;
    /** `sqlserver` or `postgresql`, when known. */
    Platform?: string;
}

/**
 * Words that mark a development or clean-room database, matched against whole words of its name
 * (`MJ_6_2_0_CLEAN_dedupe` and `mjDevCopy` match; `Devices` and `Contest` do not).
 */
export const DEV_DATABASE_WORDS: readonly string[] = ['dev', 'development', 'test', 'testing', 'clean', 'cleanroom', 'local', 'sandbox', 'scratch', 'ci'];

/** The target as a run prints it: `MJ_Dev on localhost:1433 (sqlserver)`. It never includes a credential. */
export function DescribeDatabaseTarget(target: DatabaseTarget): string {
    return `${target.Database} on ${target.Host}:${target.Port}${target.Platform ? ` (${target.Platform})` : ''}`;
}

/** A database name's words, lowercased: split at camelCase, digits, and anything else that is not a letter. */
export function DatabaseNameWords(name: string): string[] {
    return name
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((word) => word.length > 0);
}

/** Whether a database's name has a word that marks it as a development or clean-room database. */
export function LooksLikeDevDatabase(name: string): boolean {
    return DatabaseNameWords(name).some((word) => DEV_DATABASE_WORDS.includes(word));
}

/**
 * Allows a run against `target` when its name looks like a development or clean-room database, or when
 * `allowDatabase` (`--allow-db`) names it exactly (case-insensitive).
 * @throws Error when neither holds, or when `--allow-db` names a different database than the configured one.
 */
export function AssertDatabaseAllowed(target: DatabaseTarget, allowDatabase: string | null): void {
    const name = target.Database.trim();
    if (allowDatabase !== null) {
        if (allowDatabase.trim().toLowerCase() !== name.toLowerCase()) {
            throw new Error(
                `--allow-db '${allowDatabase}' does not name the configured database, ${DescribeDatabaseTarget(target)}. ` +
                'It must name the database the run would use, so a stale flag cannot allow another one.'
            );
        }
        return;
    }
    if (!LooksLikeDevDatabase(name)) {
        throw new Error(
            `Refusing to run against ${DescribeDatabaseTarget(target)}: its name has none of the words that mark a development or ` +
            `clean-room database (${DEV_DATABASE_WORDS.join(', ')}). A run reads its records, writes MJ: AI Prompt Runs rows there, ` +
            `and sends the --text-fields of its records to outside model vendors. If that is safe here, pass --allow-db ${name}.`
        );
    }
}
