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
import type { MJQueryEntity, MJQueryCategoryEntity } from '@memberjunction/core-entities';
import type sql from 'mssql';
import type { InstrumentedLocalStorageProvider } from './instrumented-cache';

/**
 * The self-contained Query/Category fixtures the `runquery-cache` bundle needs:
 * one Query Category and two Queries (TTL-mode + smart-validation-mode), created
 * before the bundle's checks run and torn down afterwards. Lifted from
 * runquery-cache-tests.ts's Ctx; threaded onto IntegrationCheckContext.Fixtures so
 * the Q-checks read them identically whether driven by the driver or the tsx script.
 */
export interface RunQueryFixtures {
    /** "Integration Test Queries <ts>" category owning the fixture queries. */
    Category: MJQueryCategoryEntity;
    /** Query WITHOUT CacheValidationSQL → TTL caching mode. */
    TtlQuery: MJQueryEntity;
    /** Query WITH CacheValidationSQL → smart-validation caching mode. */
    ValidatedQuery: MJQueryEntity;
}

/**
 * Two users with DIFFERENT effective Row-Level-Security predicates for the same
 * entity, DISCOVERED (never minted) from the provider's RLS filters + the user
 * cache by the `rls-isolation` bundle. Discovery has the safest possible teardown:
 * nothing to delete. When the deployment has only RLS-exempt admins (no two users
 * with distinct non-empty clauses), `Usable` is false and the RLS checks degrade
 * gracefully (skip-as-pass with a logged note) rather than failing.
 */
export interface RlsFixture {
    /** First discovered non-exempt user. */
    UserA: UserInfo;
    /** Second discovered non-exempt user, with a DIFFERENT effective RLS clause than UserA. */
    UserB: UserInfo;
    /** The RLS-protected entity both users can Read but with different effective predicates. */
    EntityName: string;
    /** True iff discovery found two distinct users with DIFFERENT non-empty Read RLS clauses. */
    Usable: boolean;
    /** Why the fixture is unusable (for the skip note), when Usable is false. */
    Reason?: string;
}

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
    /** Core schema (e.g. '__mj') for fixture SQL that references views directly. */
    Schema?: string;
    /** Bundle-specific setup state populated by the driver/script before the bundle runs. */
    Fixtures?: RunQueryFixtures;
    /** Discovered two-user RLS fixture for the `rls-isolation` bundle (suite-scoped). */
    RlsFixture?: RlsFixture;
    /**
     * The opaque per-selector `config` bag from `Test.Configuration.checks[].config`,
     * set by the driver/script before each bundle runs. Bundles read their own keys
     * from it (e.g. `dataset-cache` reads `datasetName`, `aggregates-cache` reads
     * `entityName`) with sensible defaults when absent.
     */
    Config?: Record<string, unknown>;
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
