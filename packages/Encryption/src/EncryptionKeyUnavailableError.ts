/**
 * @fileoverview The error for an encryption key whose material this install doesn't have.
 *
 * A key record can exist on an install whose key source doesn't hold the key: an app ships
 * credentials encrypted with its own key, and only installs that were given that key set it up
 * (say, an environment variable). That is a configuration state, not a fault, so callers that
 * decrypt on every load report it once instead of logging an error per row.
 *
 * @module @memberjunction/encryption
 */
import { LogWarning } from '@memberjunction/core';

/** Code carried by {@link EncryptionKeyUnavailableError}, for checks across package copies. */
export const ENCRYPTION_KEY_UNAVAILABLE = 'ENCRYPTION_KEY_UNAVAILABLE';

/**
 * Thrown when an encryption key's source has no material for it on this install, for example
 * when the environment variable an `EnvVarKeySource` key names is not set.
 */
export class EncryptionKeyUnavailableError extends Error {
    public readonly Code = ENCRYPTION_KEY_UNAVAILABLE;

    /**
     * @param KeyID - The encryption key's ID
     * @param KeyName - The encryption key's name
     * @param SourceName - The key source's name (e.g. "Environment Variable")
     * @param LookupValue - Where the source looks for the key (e.g. the environment variable name)
     */
    constructor(
        public readonly KeyID: string,
        public readonly KeyName: string,
        public readonly SourceName: string,
        public readonly LookupValue: string
    ) {
        super(
            `Encryption key "${KeyName}" is not configured on this install: its source ` +
                `"${SourceName}" has no key at "${LookupValue}".`
        );
        this.name = 'EncryptionKeyUnavailableError';
    }
}

/**
 * Whether `err` is an {@link EncryptionKeyUnavailableError}. Checks the code rather than
 * `instanceof`, so it holds when two copies of this package are loaded.
 */
export function IsEncryptionKeyUnavailable(err: unknown): err is EncryptionKeyUnavailableError {
    return err instanceof Error && (err as { Code?: unknown }).Code === ENCRYPTION_KEY_UNAVAILABLE;
}

/** Keys already reported by {@link ReportEncryptionKeyUnavailable} in this process. */
const reportedKeys = new Set<string>();

/**
 * Logs one warning per key per process for a key this install doesn't have, naming where it is
 * looked for. Values encrypted with it are left as they are, so nothing else needs to happen.
 */
export function ReportEncryptionKeyUnavailable(err: EncryptionKeyUnavailableError): void {
    const id = err.KeyID.toUpperCase();
    if (reportedKeys.has(id)) return;
    reportedKeys.add(id);
    LogWarning(
        `${err.message} Values encrypted with it stay encrypted on this install; to read them, ` +
            `provide the key at "${err.LookupValue}" and restart.`,
        'Encryption'
    );
}
