/**
 * @fileoverview Object keys for durable copies.
 *
 * There is deliberately no driver contract here. Where the bytes live is MJ's question, not the
 * pipeline's: `FileStorageBase` is the registry of places to put a file and a `MJ: Files` row is how
 * everything else in MJ finds one again. What IS the pipeline's business, and all that remains in
 * this file, is the rule about the key those bytes are written under.
 *
 * @module @memberjunction/content-pipeline-base
 */

/** Raised when an object key cannot be resolved. Deliberately not a soft failure — see below. */
export class ObjectKeyResolutionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ObjectKeyResolutionError';
    }
}

/**
 * Resolve an object-key template against what is known about a record.
 *
 * **Fails closed.** Where several tenants run through shared infrastructure, isolation has to be
 * explicit in the key itself. A placeholder that cannot be resolved therefore raises rather than
 * being dropped or blanked — because the failure mode of carrying on is writing one tenant's bytes
 * to an unnamespaced path, which is far worse than not writing them at all.
 *
 * @param template e.g. `{OrganizationID}/{ContentSourceID}/{RecordID}-{Name}`
 * @param values The values available to substitute.
 * @throws {ObjectKeyResolutionError} when any placeholder is missing or empty.
 *
 * @example
 * ```ts
 * ResolveObjectKey('{TenantID}/{ContentSourceID}/{RecordID}', {
 *     TenantID: 'T1', ContentSourceID: 'S1', RecordID: 'R1',
 * }); // 'T1/S1/R1'
 * ```
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
