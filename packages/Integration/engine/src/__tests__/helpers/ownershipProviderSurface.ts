import { vi } from 'vitest';

/**
 * The database surface `RunOwnershipService` needs from a provider (tasks.md PR 1).
 *
 * Every sync now claims its run row, heartbeats a lease, fences each batch boundary and
 * releases at the end — all of which go through `provider.ExecuteSQL`. Unit tests that mock
 * `Metadata.Provider` must therefore answer those statements or the run aborts at the claim.
 * Spread this into a mock provider to get a cooperative DB: the claim succeeds, the lease
 * renews, boundaries report "still ours", and progress writes are accepted.
 */
export function createOwnershipProviderSurface() {
    // The owner token is minted inside the service; capture it from the claim so the
    // boundary check can echo it back and report continued ownership.
    let ownerToken: string | null = null;
    const fenceToken = 1;

    return {
        PlatformKey: 'sqlserver',
        MJCoreSchemaName: '__mj',
        BuildParameterPlaceholder: (i: number) => `@p${i}`,
        Dialect: {
            QuoteIdentifier: (name: string) => `[${name}]`,
            CurrentTimestampUTC: () => 'SYSDATETIMEOFFSET()',
            ProcedureCallSyntax: (schema: string, sproc: string, placeholders: string[]) =>
                `EXEC [${schema}].[${sproc}] ${placeholders.join(', ')}`,
        },
        ExecuteSQL: vi.fn(async (sql: string, params: unknown[]) => {
            const leaseExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
            if (sql.includes('spClaimCompanyIntegrationRun')) {
                ownerToken = String(params?.[1] ?? '');
                return [{ FenceToken: fenceToken, LeaseExpiresAt: leaseExpiresAt }];
            }
            if (sql.includes('spRenewCompanyIntegrationRunLease')) {
                return [{ FenceToken: fenceToken, LeaseExpiresAt: leaseExpiresAt, CancelRequestedAt: null }];
            }
            if (sql.includes('spReleaseCompanyIntegrationRun')) {
                return [{ ID: String(params?.[0] ?? '') }];
            }
            if (sql.includes('ownership boundary check') || (sql.startsWith('SELECT') && sql.includes('[FenceToken]'))) {
                return [{ OwnerToken: ownerToken, FenceToken: fenceToken, CancelRequestedAt: null }];
            }
            return [];
        }),
    };
}
