/**
 * check.ts — the integration-check contract.
 *
 * A check is a FUNCTION that THROWS on failure (the harness Assert* helpers throw)
 * and RETURNS on pass. Bodies are lifted verbatim from the tsx harness, so
 * migration is a lift-and-register, not a rewrite. The IntegrationTestDriver wraps
 * each check in try/catch and maps the outcome onto an OracleResult — there is no
 * separate per-check result interface.
 */
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type sql from 'mssql';
import type { InstrumentedLocalStorageProvider } from './instrumented-cache';

/** The bootstrapped, run-scoped real provider stack handed to every check. */
export interface IntegrationCheckContext {
    /** Resolved context user threaded from the engine (server) or bootstrap. */
    User: UserInfo;
    /** Run-scoped provider — SQLServerDataProvider (server) or GraphQLDataProvider (client). */
    Provider: IMetadataProvider;
    /** Instrumented cache wrapper: per-category Get/Set counters; ResetCounts(). */
    Storage: InstrumentedLocalStorageProvider;
    /** Present for server-side bundles that need raw SQL fixtures; undefined for client bundles. */
    Pool?: sql.ConnectionPool;
}

/**
 * A single integration check. THROWS on failure (the harness Assert* helpers
 * throw); returns on pass.
 */
export type IntegrationCheckFn = (ctx: IntegrationCheckContext) => Promise<void>;

/** A registered check. Id is '<bundle>.<localId>', e.g. 'server-cache.S1'. */
export interface NamedCheck {
    Id: string;
    Name: string;
    Fn: IntegrationCheckFn;
    /** Gated tier — runs only when RUN_MUTATION_TESTS is set (mutation-active checks). */
    RequiresMutation?: boolean;
    /** Gated tier — runs only when RUN_AGENT_TESTS is set (live-model checks). */
    RequiresLiveModel?: boolean;
}
