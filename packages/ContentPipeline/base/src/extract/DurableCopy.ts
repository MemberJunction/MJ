/**
 * @fileoverview Object keys for durable copies. Storage itself is `FileStorageBase` and `MJ: Files`.
 *
 * @module @memberjunction/content-pipeline-base
 */

/** Raised when an object key cannot be resolved. */
export class ObjectKeyResolutionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ObjectKeyResolutionError';
    }
}

/**
 * Resolve an object-key template against a record's values. Fails closed so one tenant's bytes are
 * never written to an unnamespaced path.
 *
 * @param template e.g. `{OrganizationID}/{ContentSourceID}/{RecordID}-{Name}`
 * @throws {ObjectKeyResolutionError} when any placeholder is missing or empty.
 */
export function ResolveObjectKey(template: string, values: Readonly<Record<string, string | null | undefined>>): string {
    const missing: string[] = [];
    const resolved = template.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, name: string) => {
        const value = values[name];
        if (value === undefined || value === null || value.length === 0) {
            missing.push(name);
            return '';
        }
        return sanitizeSegment(value);
    });

    if (missing.length > 0) {
        throw new ObjectKeyResolutionError(
            `Cannot resolve object key '${template}': no value for ${missing.map((m) => `'${m}'`).join(', ')}. ` +
                `Refusing to write to a key that is missing part of its namespace.`,
        );
    }
    return resolved;
}

/** Keep a substituted value from breaking out of its path segment. */
function sanitizeSegment(value: string): string {
    return value.replace(/[\\/]+/g, '_').replace(/\.\.+/g, '_').trim();
}
