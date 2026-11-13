/**
 * The check MJServer's bootstrap runs once metadata has loaded: a server holding no entity metadata
 * cannot serve any request that needs it, so it must not report ready.
 *
 * Metadata loading logs a failed read and keeps whatever it already had, so a boot whose only load
 * fails ends with no entities and no exception. Throwing here turns that into a failed start: the
 * startup gate keeps answering `/healthcheck` with 503 and the phase, and the log names the cause.
 */
import { ProviderBase } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';

/** The startup phase the check runs in, reported by `/healthcheck` when it fails. */
export const ENTITY_METADATA_CHECK_PHASE = 'Checking entity metadata';

/** Thrown when the bootstrap finished loading metadata and the provider holds no entities. */
export class NoEntityMetadataError extends Error {
    public constructor(databaseLabel: string, cause: Error | null) {
        super(NoEntityMetadataError.describe(databaseLabel, cause), cause ? { cause } : undefined);
        this.name = 'NoEntityMetadataError';
    }

    private static describe(databaseLabel: string, cause: Error | null): string {
        const reason = cause
            ? `The last metadata load failed: ${cause.message}`
            : 'The metadata load reported no error, so the MJ_Metadata dataset was read but held no entities.';
        return `No entity metadata was loaded from ${databaseLabel}; every request that needs metadata would fail. ${reason}`;
    }
}

/**
 * Returns how many entities `provider` holds, or throws {@link NoEntityMetadataError} when it holds
 * none. `databaseLabel` names the database in the error (for example `SQL Server host:1433/db`).
 */
export function AssertEntityMetadataLoaded(provider: IMetadataProvider, databaseLabel: string): number {
    const entityCount = provider?.Entities?.length ?? 0;
    if (entityCount > 0) {
        return entityCount;
    }
    const cause = provider instanceof ProviderBase ? provider.LastMetadataLoadError : null;
    throw new NoEntityMetadataError(databaseLabel, cause);
}
