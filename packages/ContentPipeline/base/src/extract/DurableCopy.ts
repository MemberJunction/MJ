/**
 * @fileoverview Durable copies — keeping the bytes a record was made from.
 *
 * A non-text record that has to be retrievable later, without re-authenticating against its original
 * source, keeps its bytes once. The pipeline stores a reference; the bytes live in whichever backend
 * a deployment configured.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { MJGlobal } from '@memberjunction/global';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';

/** What to persist. */
export interface DurableCopyRequest {
    /** The bytes. */
    Content: Uint8Array;
    /** The object key to write under, already resolved and verified. */
    ObjectKey: string;
    /** The transport's content-type claim, when there was one. */
    ContentType?: string;
    /** The acting user. */
    ContextUser: UserInfo;
    /** The provider to read through. */
    Provider: IMetadataProvider;
    /** Fires when the run is asked to stop. */
    Signal: AbortSignal;
}

/** Where the bytes went. */
export interface DurableCopyResult {
    /** The `MJ: Files` record holding the metadata, when the store created one. */
    FileID?: string;
    /** The key the bytes were written under. */
    ObjectKey: string;
}

/**
 * A registered place to keep bytes.
 *
 * Separate from user-uploaded attachments by design: content the pipeline fetched has a different
 * lifecycle and a different access story, and mixing the two makes both harder to reason about.
 */
export abstract class BaseDurableCopyStore {
    /** The registration key. Must match the key passed to `@RegisterClass`. */
    public abstract readonly Key: string;

    /** Write the bytes and return where they went. */
    public abstract Persist(request: DurableCopyRequest): Promise<DurableCopyResult>;

    /** Resolve a registered store by key, returning null rather than a hollow base instance. */
    public static Resolve(key: string): BaseDurableCopyStore | null {
        if (!key || key.trim().length === 0) {
            return null;
        }
        const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseDurableCopyStore>(
            BaseDurableCopyStore,
            key.trim(),
        );
        return result.Resolved ? result.Instance : null;
    }
}

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
