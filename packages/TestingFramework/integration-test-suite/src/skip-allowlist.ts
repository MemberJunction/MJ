/**
 * skip-allowlist.ts — the checks that may skip without failing the run.
 *
 * A skipped check verified nothing, so `mj test suite` fails a run with any skip that is not listed
 * here. Two kinds of skip are expected and listed:
 *
 *   - `mutation`: the check writes to the database and runs only on the nightly lane
 *     (RUN_MUTATION_TESTS=1). A check flagged `RequiresMutation` is allowed by the driver without an
 *     entry; this list covers checks that test the gate themselves at run time.
 *
 * A `RequiresMutation` check is driver-allowed only while the tier is UNARMED. On the nightly the
 * tier IS armed, so the check RUNS — and a secondary skip of its own (an environment it cannot
 * exercise, a transport that cannot transact, a deferred product limitation) is then judged like any
 * other skip and needs an entry below. This asymmetry is easy to miss, because every PR run stays
 * green while the nightly is the only lane that can see the skip: the gate shipped with no entries
 * for these and the nightly lane failed every night for over a month as a result.
 *   - `credentials`: the check needs model, service or database credentials the deterministic lane
 *     does not have. `RequiresLiveModel` checks are allowed by the driver without an entry.
 *
 * Three more gates cover skips that were ruled on rather than fixed: `fixture` (data CI deliberately
 * does not seed), `not-applicable` (the stock schema or catalog has nothing for the check to examine,
 * or the leg is for another database platform) and `pending-ruling` (waiting on a decision someone
 * else owns; the reason names it). A bare bundle name allows a Test parked by `requiresEnv`.
 *
 * Every entry must name a registered check (enforced by check-registry.test.ts). Keep the reason
 * specific: it is printed next to the skip in the run's output.
 */
import { IntegrationCheckRegistry, type AllowedSkip } from '@memberjunction/testing-integration';

export const SKIP_ALLOWLIST: readonly AllowedSkip[] = [
    {
        CheckId: 'runquery-rendering-client.RRC3',
        Gate: 'credentials',
        Reason: 'Needs a read-only database login: the MJAPI read-only connection (DB_READ_ONLY_USERNAME / DB_READ_ONLY_PASSWORD) is not configured on the deterministic lane.'
    },
    {
        CheckId: 'runquery-rendering-client.RRC5',
        Gate: 'credentials',
        Reason: 'Needs a read-only database login: the MJAPI read-only connection (DB_READ_ONLY_USERNAME / DB_READ_ONLY_PASSWORD) is not configured on the deterministic lane.'
    },
    {
        CheckId: 'runquery-rendering-client.RRC7',
        Gate: 'credentials',
        Reason: 'Needs a read-only database login: the MJAPI read-only connection (DB_READ_ONLY_USERNAME / DB_READ_ONLY_PASSWORD) is not configured on the deterministic lane.'
    },
    {
        CheckId: 'runquery-rendering-client.RRC8',
        Gate: 'credentials',
        Reason: 'Needs a read-only database login: the MJAPI read-only connection (DB_READ_ONLY_USERNAME / DB_READ_ONLY_PASSWORD) is not configured on the deterministic lane.'
    },
    {
        CheckId: 'runquery-rendering-client.RRC9',
        Gate: 'credentials',
        Reason: 'Needs a read-only database login: the MJAPI read-only connection (DB_READ_ONLY_USERNAME / DB_READ_ONLY_PASSWORD) is not configured on the deterministic lane.'
    },
    {
        CheckId: 'runquery-rendering-client.RRC10',
        Gate: 'credentials',
        Reason: 'Needs a read-only database login: the MJAPI read-only connection (DB_READ_ONLY_USERNAME / DB_READ_ONLY_PASSWORD) is not configured on the deterministic lane.'
    },
    {
        CheckId: 'metadata-consistency.MC1',
        Gate: 'credentials',
        Reason: 'Needs a database login with VIEW DEFINITION (db_owner/sa) to read catalog definitions; a least-privilege login cannot.'
    },
    {
        CheckId: 'metadata-consistency.MC2',
        Gate: 'credentials',
        Reason: 'Needs a database login with VIEW DEFINITION (db_owner/sa) to read catalog definitions; a least-privilege login cannot.'
    },
    {
        CheckId: 'metadata-consistency.MC3',
        Gate: 'credentials',
        Reason: 'Needs a database login with VIEW DEFINITION (db_owner/sa) to read catalog definitions; a least-privilege login cannot.'
    },
    {
        CheckId: 'metadata-consistency.MC4',
        Gate: 'credentials',
        Reason: 'Needs a database login with VIEW DEFINITION (db_owner/sa) to read catalog definitions; a least-privilege login cannot.'
    },
    {
        CheckId: 'metadata-consistency.MC5',
        Gate: 'credentials',
        Reason: 'Needs a database login with VIEW DEFINITION (db_owner/sa) to read catalog definitions; a least-privilege login cannot.'
    },
    {
        CheckId: 'metadata-consistency.MC6',
        Gate: 'credentials',
        Reason: 'Needs a database login with VIEW DEFINITION (db_owner/sa) to read catalog definitions; a least-privilege login cannot.'
    },
    {
        CheckId: 'metadata-consistency.MC8',
        Gate: 'credentials',
        Reason: 'Needs a database login with VIEW DEFINITION (db_owner/sa) to read catalog definitions; a least-privilege login cannot.'
    },
    {
        CheckId: 'metadata-consistency.MC9',
        Gate: 'credentials',
        Reason: 'Needs a database login with VIEW DEFINITION (db_owner/sa) to read catalog definitions; a least-privilege login cannot.'
    },
    {
        CheckId: 'layered-base-views.LBV2',
        Gate: 'credentials',
        Reason: 'Needs a database login with VIEW DEFINITION (db_owner/sa) to read catalog definitions; a least-privilege login cannot.'
    },
    {
        CheckId: 'layered-base-views.LBV3',
        Gate: 'credentials',
        Reason: 'Needs a database login with VIEW DEFINITION (db_owner/sa) to read catalog definitions; a least-privilege login cannot.'
    },
    {
        CheckId: 'layered-base-views.LBV4',
        Gate: 'credentials',
        Reason: 'Needs a database login with VIEW DEFINITION (db_owner/sa) to read catalog definitions; a least-privilege login cannot.'
    },
    {
        CheckId: 'layered-base-views.LBV5',
        Gate: 'credentials',
        Reason: 'Needs a database login with VIEW DEFINITION (db_owner/sa) to read catalog definitions; a least-privilege login cannot.'
    },
    {
        CheckId: 'ai-vendor-effort.AVE1',
        Gate: 'credentials',
        Reason: 'Calls real models: needs a credential for an effort-capable model (MJ credential binding, vendor default credential, or AI_VENDOR_API_KEY__<DRIVER>).'
    },
    {
        CheckId: 'ai-vendor-effort.AVE2',
        Gate: 'credentials',
        Reason: 'Calls real models: needs a credential for an effort-capable model (MJ credential binding, vendor default credential, or AI_VENDOR_API_KEY__<DRIVER>).'
    },
    {
        CheckId: 'calendar-event-links.CL1',
        Gate: 'credentials',
        Reason: 'Connects a UI reader over the wire: needs MJ_API_KEY for a running MJAPI.'
    },
    {
        CheckId: 'storage.ST8',
        Gate: 'credentials',
        Reason: 'Creates a fixture storage account whose MJ: Credentials row is field-encrypted: needs a field-encryption key, which the deterministic lane does not configure.'
    },
    {
        CheckId: 'storage.ST9',
        Gate: 'credentials',
        Reason: 'Creates a fixture storage account whose MJ: Credentials row is field-encrypted: needs a field-encryption key, which the deterministic lane does not configure.'
    },
    {
        CheckId: 'realtime-deterministic.RD3',
        Gate: 'not-applicable',
        Reason: 'Audits co-agent pairing rows; MJ ships none, so a stock install has nothing to audit.'
    },
    {
        CheckId: 'view-execution.V11',
        Gate: 'not-applicable',
        Reason: 'No MJ entity has a composite primary key, so the composite-key branch is unreachable on the stock schema.'
    },
    {
        CheckId: 'runview-matrix.RVM11',
        Gate: 'not-applicable',
        Reason: 'No shipped entity has a binding UserViewMaxRows cap; adding one is product metadata, not a test fixture.'
    },
    {
        CheckId: 'runquery-catalog.QC6',
        Gate: 'not-applicable',
        Reason: 'Sweeps the shipped query catalog, and MJ ships no templated zero-parameter query.'
    },
    {
        CheckId: 'scoped-anon-elevation.SA7',
        Gate: 'not-applicable',
        Reason: 'Skips only on PostgreSQL: spConsumeMagicLinkInvite exists only on SQL Server, and the PostgreSQL consume statement lives in MJServer, which this suite does not import.'
    },
    {
        CheckId: 'runquery-rendering-client.RRC4',
        Gate: 'not-applicable',
        Reason: 'PostgreSQL-only leg; SQL Server applies the timeout in the driver, so there is nothing to read.'
    },
    {
        CheckId: 'runquery-rendering-client.RRC6',
        Gate: 'not-applicable',
        Reason: 'PostgreSQL-only leg on SQL Server; on PostgreSQL it also needs the read-only database login.'
    },
    {
        CheckId: 'subscription-isolation.SI2',
        Gate: 'pending-ruling',
        Reason: 'Known coverage gap: needs a dual-identity WebSocket harness that does not exist; building one is for the suite owner to decide.'
    },
    {
        CheckId: 'entity-server-invariants.ESI6',
        Gate: 'pending-ruling',
        Reason: 'MJApplicationEntityServer resolves in a plain process but not in the client-transport suite run; cause not found, possible class-registration defect for the product owner.'
    },
    {
        CheckId: 'search',
        Gate: 'pending-ruling',
        Reason: 'IT52 is parked (requiresEnv RUN_SEARCH_TESTS): the host lane has no lexical search provider; un-parking needs one provisioned or the unconfigured detection in the bundle fixed.'
    },
    {
        CheckId: 'prompt-eval-harness.PE7',
        Gate: 'fixture',
        Reason: 'Needs the prompt-eval corpus in the database; CI pushes only metadata and metadata-optional/integration-test, '
            + 'and the corpus stays out on purpose as a measurement fixture (#4438).'
    },
    {
        CheckId: 'encrypted-read-client.ER1',
        Gate: 'credentials',
        Reason: 'Needs a base encryption key (MJ_BASE_ENCRYPTION_KEY) in the process that writes MJ: Credentials.Values — '
            + 'MJAPI for the client bundle, the test process for the server bundle; a lane without one cannot create the encrypted fixture.'
    },
    {
        CheckId: 'encrypted-read-client.ER2',
        Gate: 'credentials',
        Reason: 'Needs a base encryption key (MJ_BASE_ENCRYPTION_KEY) in the process that writes MJ: Credentials.Values — '
            + 'MJAPI for the client bundle, the test process for the server bundle; a lane without one cannot create the encrypted fixture.'
    },
    {
        CheckId: 'encrypted-read-client.ER3',
        Gate: 'credentials',
        Reason: 'Needs a base encryption key (MJ_BASE_ENCRYPTION_KEY) in the process that writes MJ: Credentials.Values — '
            + 'MJAPI for the client bundle, the test process for the server bundle; a lane without one cannot create the encrypted fixture.'
    },
    {
        CheckId: 'encrypted-read-client.ER4',
        Gate: 'credentials',
        Reason: 'Needs a base encryption key (MJ_BASE_ENCRYPTION_KEY) in the process that writes MJ: Credentials.Values — '
            + 'MJAPI for the client bundle, the test process for the server bundle; a lane without one cannot create the encrypted fixture.'
    },
    {
        CheckId: 'record-change-snapshot.RCS4',
        Gate: 'credentials',
        Reason: 'Needs a base encryption key (MJ_BASE_ENCRYPTION_KEY) in the process that writes MJ: Credentials.Values — '
            + 'MJAPI for the client bundle, the test process for the server bundle; a lane without one cannot create the encrypted fixture.'
    },
    {
        CheckId: 'ciphertext-cache.CT0',
        Gate: 'credentials',
        Reason: 'Needs a base encryption key (MJ_BASE_ENCRYPTION_KEY) in the process that writes MJ: Credentials.Values — '
            + 'MJAPI for the client bundle, the test process for the server bundle; a lane without one cannot create the encrypted fixture.'
    },
    {
        CheckId: 'ciphertext-cache.CT1',
        Gate: 'credentials',
        Reason: 'Needs a base encryption key (MJ_BASE_ENCRYPTION_KEY) in the process that writes MJ: Credentials.Values — '
            + 'MJAPI for the client bundle, the test process for the server bundle; a lane without one cannot create the encrypted fixture.'
    },
    {
        CheckId: 'ciphertext-cache.CT2',
        Gate: 'credentials',
        Reason: 'Needs a base encryption key (MJ_BASE_ENCRYPTION_KEY) in the process that writes MJ: Credentials.Values — '
            + 'MJAPI for the client bundle, the test process for the server bundle; a lane without one cannot create the encrypted fixture.'
    },
    {
        CheckId: 'ciphertext-cache.CT3',
        Gate: 'credentials',
        Reason: 'Needs a base encryption key (MJ_BASE_ENCRYPTION_KEY) in the process that writes MJ: Credentials.Values — '
            + 'MJAPI for the client bundle, the test process for the server bundle; a lane without one cannot create the encrypted fixture.'
    },
    {
        CheckId: 'ciphertext-cache.CT4',
        Gate: 'credentials',
        Reason: 'Needs a base encryption key (MJ_BASE_ENCRYPTION_KEY) in the process that writes MJ: Credentials.Values — '
            + 'MJAPI for the client bundle, the test process for the server bundle; a lane without one cannot create the encrypted fixture.'
    },

    // ── Mutation-armed secondary skips ────────────────────────────────────────────────────────────
    // The checks below are `RequiresMutation`, so a PR run skips them at the tier gate and the driver
    // allows that without an entry. The nightly arms the tier, the check runs, and it then skips for
    // a reason of its own — which is what these entries cover. See the asymmetry note in the header.
    {
        CheckId: 'server-cache.S30',
        Gate: 'pending-ruling',
        Reason: 'Cross-entity denormalization invalidation is not implemented: RunView cache invalidation keys on the '
            + 'changed entity (MJ: Query Categories), not on dependent entities that denormalize its name (MJ: Queries), '
            + 'so renaming a parent does not refresh cached child rows. Fanning invalidation out to every dependent '
            + 'entity is a broad, higher-risk change for the cache owner to schedule. The check skips rather than '
            + 'redding the tier and re-arms itself once the fan-out lands.'
    },
    {
        CheckId: 'role-elevation.RE6',
        Gate: 'not-applicable',
        Reason: 'The end-to-end Save() leg needs an ACTIVE non-Owner principal that holds CanCreate on MJ: User Roles '
            + 'AND holds at least one role AND lacks at least one — a shape the stock catalog plus the CI fixtures do '
            + 'not produce. Unexercised, not violated: RE1-RE5 are ungated and RE2 proves the guard refuses the '
            + 'escalation on every run. Seeding such a principal will un-park this leg (#6594).'
    },
    {
        CheckId: 'entity-server-invariants.ESI9',
        Gate: 'not-applicable',
        Transport: 'client',
        Reason: 'Server-transport-only leg: MJTemplateContentEntityServer.Save wraps param-sync in a provider '
            + 'transaction, which the in-process SQLServerDataProvider has and the client GraphQL provider does not. '
            + 'Scoped to Transport "client" so a skip on a server shard stays a hard failure.'
    },
    {
        CheckId: 'realtime-session-verification.RSV1',
        Gate: 'credentials',
        Reason: 'Needs MJAPI configured for mid-session identity verification (realtime.identityVerification enabled, '
            + 'a communicationProvider, an hmacSecret and deliveryMode "dry-run" so the email is logged, not sent). '
            + 'The deterministic lane boots MJAPI without them (#6595).'
    },
    {
        CheckId: 'realtime-session-verification.RSV2',
        Gate: 'credentials',
        Reason: 'Needs MJAPI configured for mid-session identity verification (realtime.identityVerification enabled, '
            + 'a communicationProvider, an hmacSecret and deliveryMode "dry-run" so the email is logged, not sent). '
            + 'The deterministic lane boots MJAPI without them (#6595).'
    },
    {
        CheckId: 'realtime-session-verification.RSV4',
        Gate: 'credentials',
        Reason: 'Needs MJAPI configured for mid-session identity verification (realtime.identityVerification enabled, '
            + 'a communicationProvider, an hmacSecret and deliveryMode "dry-run" so the email is logged, not sent). '
            + 'The deterministic lane boots MJAPI without them (#6595).'
    },
    {
        CheckId: 'realtime-session-verification.RSV5',
        Gate: 'credentials',
        Reason: 'Needs MJAPI configured for mid-session identity verification (realtime.identityVerification enabled, '
            + 'a communicationProvider, an hmacSecret and deliveryMode "dry-run" so the email is logged, not sent). '
            + 'The deterministic lane boots MJAPI without them (#6595).'
    },
    {
        CheckId: 'realtime-session-verification.RSV6',
        Gate: 'credentials',
        Reason: 'Needs MJAPI configured for mid-session identity verification (realtime.identityVerification enabled, '
            + 'a communicationProvider, an hmacSecret and deliveryMode "dry-run" so the email is logged, not sent). '
            + 'The deterministic lane boots MJAPI without them (#6595).'
    },
];

for (const entry of SKIP_ALLOWLIST) {
    IntegrationCheckRegistry.Instance.AllowSkip(entry);
}
