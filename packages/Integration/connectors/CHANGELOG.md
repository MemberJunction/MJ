# @memberjunction/integration-connectors

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [323df0f]
- Updated dependencies [b1b24d7]
- Updated dependencies [405c035]
- Updated dependencies [c42c0e8]
- Updated dependencies [b9a8324]
- Updated dependencies [ff1b875]
- Updated dependencies [1a2ce13]
- Updated dependencies [653c51d]
- Updated dependencies [716b930]
- Updated dependencies [fa616d3]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [79afbff]
- Updated dependencies [e3a1425]
- Updated dependencies [427fa8b]
- Updated dependencies [8e469c3]
- Updated dependencies [d10f112]
- Updated dependencies [f52be10]
- Updated dependencies [4f7f929]
- Updated dependencies [87aa62a]
- Updated dependencies [595c945]
- Updated dependencies [64915b9]
- Updated dependencies [5fc861f]
- Updated dependencies [5c1d762]
- Updated dependencies [905820a]
- Updated dependencies [cc474d5]
- Updated dependencies [2c8fbc7]
- Updated dependencies [4f20e10]
- Updated dependencies [1f66f31]
  - @memberjunction/integration-engine@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/external-data-sources@6.1.0-edge.5
  - @memberjunction/integration-engine-base@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [6242df1]
- Updated dependencies [d40251e]
- Updated dependencies [a59e52d]
- Updated dependencies [e2ad3c0]
- Updated dependencies [29187f8]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [f2fa6b3]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [e7b4833]
- Updated dependencies [9cce262]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0aa2b91]
- Updated dependencies [74e161d]
- Updated dependencies [0db4f4f]
- Updated dependencies [a04d5c9]
- Updated dependencies [a1a8989]
- Updated dependencies [d31cba4]
- Updated dependencies [d078c54]
- Updated dependencies [ec71199]
- Updated dependencies [c4e98ce]
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/integration-engine@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/integration-engine-base@6.1.0-edge.4
  - @memberjunction/external-data-sources@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [2003cd3]
- Updated dependencies [bb79505]
- Updated dependencies [52490a7]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [5b30129]
- Updated dependencies [9cd81ca]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [68b9cf0]
- Updated dependencies [d29d6b9]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [af4bd79]
- Updated dependencies [f315e44]
- Updated dependencies [ca3657d]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/integration-engine@6.1.0-edge.3
  - @memberjunction/external-data-sources@6.1.0-edge.3
  - @memberjunction/integration-engine-base@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/integration-engine@6.1.0-edge.2
  - @memberjunction/external-data-sources@6.1.0-edge.2
  - @memberjunction/integration-engine-base@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/external-data-sources@6.1.0-edge.1
  - @memberjunction/integration-engine@6.1.0-edge.1
  - @memberjunction/integration-engine-base@6.1.0-edge.1

## 6.1.0-edge.0

### Minor Changes

- a16f0db: <!-- Bump type is `minor`, not `major`, even though this IS a breaking change. The repo sits
       at an unpublished 6.0.0 (nothing above 5.51.0 is on npm) and 6.0.0 is itself the era open
       that carries the 6.x breaking changes — so this ships *inside* it. Under the fixed group
       and changesets pre-mode, a `major` here resolves to 7.0.0-edge.0 and burns the entire 6.x
       era in one release; verified by running `changeset version`. publish.yml's era gate only
       hard-fails *unsuffixed* versions, so `7.0.0-edge.0` would sail through it. Use `major`
       only once 6.x has actually shipped and you mean to open 7. -->

  **BREAKING (6.x): remove the 36 vendor connectors from `@memberjunction/integration-connectors`.**

  Every one of them was a duplicate — the same class shipped from both this monorepo and the
  [MemberJunction/Integrations](https://github.com/MemberJunction/Integrations) repo, where each connector
  is a self-contained Open App (`@memberjunction/connector-<vendor>`) with its own versioning, changesets,
  metadata, CI gates and seed migrations for SQL Server **and** PostgreSQL. The Integrations copy is the
  one that ships to customers; keeping a second copy here meant fixing everything twice and letting the
  two drift. The Integrations repo is now the single source of truth, and connectors version independently
  of the MJ core release train.

  Removed: Aptify, Blackbaud, ConstantContact, Cvent, DynamicsDataverse, FileFeed, Fonteva, GrowthZone,
  Hivebrite, HubSpot, iMIS, MJToMJ, MagnetMail, Mailchimp, MemberSuite, NeonCRM, NetForum, NetSuite,
  NimbleAMS, Novi, ORCID, OpenWater, PathLMS, PheedLoop, PropFuel, QuickBooks, Rasa, Reach360,
  RelationalDB, Rhythm, SageIntacct, Salesforce, SharePoint, Wicket, WildApricot, YourMembership — plus
  their unit tests, fixtures and the `generate-integration-actions.ts` CLI that existed only to instantiate
  them.

  **What remains** is the three External Data Source connector base classes —
  `BaseExternalDataSourceConnector`, `BaseSqlExternalDataSourceConnector` and
  `BaseDocumentDataSourceConnector`. These are _not_ duplicated: six shipped Open Apps (SQL Server,
  PostgreSQL, MySQL, Oracle, Snowflake, MongoDB) import them from this package rather than carrying their
  own copy, so the package stays — reduced to that shared layer.

  **Migration.** Install the Open App for each connector you use. Its seed migration writes the _same_
  `__mj.Integration` row (same hardcoded ID as the original monorepo seed) with `ClassName` and
  `ImportPath` re-pointed to the connector's npm package, so existing `CompanyIntegration` records keep
  working. Direct imports change from `@memberjunction/integration-connectors` to
  `@memberjunction/connector-<vendor>`. **A deployment that upgrades to 6.x without installing the
  corresponding Open App will have catalog rows pointing at a package that no longer contains those
  classes, and those integrations will fail to resolve.** Applied migrations under `migrations/v5/**` are
  untouched — the re-point happens forward, through each Open App's own migration.

  **The same-ID re-point holds for 16 of the 24 monorepo-seeded integrations, but NOT for seven of them.**
  Comparing every `spCreateIntegration` seed in `migrations/v5/**` against every Open App seed in the
  Integrations repo, these seven do not re-point an existing row and need a manual step before or during a
  6.x upgrade:

  | Integration      | monorepo seed                   | Open App seed                   | what happens on install                                  |
  | ---------------- | ------------------------------- | ------------------------------- | -------------------------------------------------------- |
  | Mailchimp        | `987FA1B5-…` `Mailchimp`        | `D9C7F5B4-…` `mailchimp`        | **install fails** — `UQ_Integration_Name` violation      |
  | Blackbaud        | `2BBF275A-…` `Blackbaud`        | `0159550E-…` `blackbaud`        | **install fails** — same, collation is `CI`              |
  | HubSpot          | `3DD4C246-…` `HubSpot`          | `71EC4CCB-…` `HubSpot`          | **install fails** — same                                 |
  | MagnetMail       | `7F9BD70C-…` `MagnetMail`       | `98A49146-…` `magnetmail`       | **install fails** — same                                 |
  | Wild Apricot     | `4FB2B6BF-…` `Wild Apricot`     | `FE1334F6-…` `Wild Apricot`     | **install fails** — same                                 |
  | Constant Contact | `16B66076-…` `Constant Contact` | `65BB124A-…` `constant-contact` | installs a **second** row; the original silently dangles |
  | File Feed        | `D26F22CE-…` `File Feed`        | _(no seed migration at all)_    | nothing re-points it; the row dangles                    |

  For the five collision cases the Open App migration aborts on `UQ_Integration_Name`, so the connector
  cannot be installed at all until the pre-existing row is renamed or removed; for the last two the install
  succeeds but leaves the original row pointing at the emptied package. Repointing those seven rows —
  either by aligning the Open App seed IDs or by a forward re-point migration — is a prerequisite for the
  6.x cut, not an upgrade footnote.

  Also in this change:
  - `@memberjunction/server-bootstrap` drops its `@memberjunction/integration-connectors` dependency and
    the 35 corresponding entries from its generated class-registration manifest. That dependency existed
    solely to statically pin `@RegisterClass` classes against tree-shaking; the remaining base classes are
    abstract and register nothing, so it no longer served a purpose.
  - `@memberjunction/integration-connectors` drops `jsonwebtoken`, `mssql`, `zod` and
    `@memberjunction/global`, none of which the remaining source imports.
  - `packages/Integration/docs/connector-development.md` and `INTEGRATION_ACTIONS.md` now direct new
    connector work to the Integrations repo, with a table mapping each monorepo convention to its Open App
    equivalent (including the registration-key change from the bare class symbol to the npm package name).

### Patch Changes

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/external-data-sources@6.1.0-edge.0
  - @memberjunction/integration-engine@6.1.0-edge.0
  - @memberjunction/integration-engine-base@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/external-data-sources@6.0.0
  - @memberjunction/integration-engine@6.0.0
  - @memberjunction/integration-engine-base@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/external-data-sources@5.51.0
  - @memberjunction/integration-engine@5.51.0
  - @memberjunction/integration-engine-base@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- dd04a24: Widen the zod pin from `~3.24.4` to `^3.25.0` so it satisfies `@modelcontextprotocol/sdk`'s peer requirement (`zod ^3.25 || ^4.0`). The old tilde pin has no overlap with the SDK's peer range, which breaks strict package managers (pnpm) and MJCLI's oclif manifest generation under strict installs. zod 3.25.x keeps the classic v3 API at the root import, so this is a version-range correction with no behavior change.
- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [a3bd648]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [1e0008f]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/external-data-sources@5.50.0
  - @memberjunction/integration-engine@5.50.0
  - @memberjunction/integration-engine-base@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [48fa886]
- Updated dependencies [314f667]
- Updated dependencies [70113b1]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/integration-engine@5.49.0
  - @memberjunction/external-data-sources@5.49.0
  - @memberjunction/integration-engine-base@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/external-data-sources@5.48.0
  - @memberjunction/integration-engine@5.48.0
  - @memberjunction/integration-engine-base@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/external-data-sources@5.47.0
  - @memberjunction/integration-engine@5.47.0
  - @memberjunction/integration-engine-base@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/external-data-sources@5.46.0
  - @memberjunction/integration-engine@5.46.0
  - @memberjunction/integration-engine-base@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- 1740db3: Add the External-Data-Source-backed ingestion connector abstractions (the "heart"): `BaseExternalDataSourceConnector` (family-neutral — resolves the shared `MJ: External Data Sources` row via the EDS router, `TestConnection`, `IntrospectSchema` mapping `ExternalSchemaDescriptor` → `SourceSchemaInfo`, and generic incremental `FetchChanges` that passes a **structured `incrementalSince` watermark bound + raw ordering columns** to `driver.RunView` — the connector writes NO dialect SQL; the EDS driver renders the predicate, quoting, and literal formatting), plus the `BaseSqlExternalDataSourceConnector` (SQL family — **authoritative** discovery) and `BaseDocumentDataSourceConnector` (document/NoSQL family — **non-authoritative** sampled discovery) families. The connection binds to a shared EDS row via `Configuration.externalDataSourceID`; credentials flow through CredentialEngine. Deprecates the SQL-Server-hardcoded, inline-`mssql` `RelationalDBConnector`. Thin per-engine leaves ship as Open Apps in the MemberJunction/Integrations repo.
- Updated dependencies [00e573c]
  - @memberjunction/external-data-sources@5.45.1
  - @memberjunction/integration-engine@5.45.1
  - @memberjunction/integration-engine-base@5.45.1
  - @memberjunction/core@5.45.1
  - @memberjunction/core-entities@5.45.1
  - @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [f99cbc1]
- Updated dependencies [11d5b4e]
- Updated dependencies [fbee64c]
- Updated dependencies [81a8aa2]
- Updated dependencies [82ca89b]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/integration-engine@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/integration-engine-base@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/integration-engine@5.44.0
  - @memberjunction/integration-engine-base@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [b98366b]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/integration-engine@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/integration-engine-base@5.43.0

## 5.42.0

### Minor Changes

- 03aa04d: Make `mj sync push` idempotent for six connectors (SharePoint, Neon CRM, Fonteva, MemberSuite, PheedLoop, Rhythm) by filling their null `BatchMaxRequestCount` / `BatchRequestWaitTime`.

  Those columns are NOT NULL but carry a default. `BaseEntity.Validate()` (the client-side check `mj sync push` runs before saving) permits a null on a **new** record — the column default applies — but rejects it on an **existing** record, because a prior non-null value is present (`<field> cannot be null`). So a fresh-DB create silently absorbs the null while any re-push that _updates_ an existing connector row fails — i.e. the push is not idempotent for these files.

  This surfaced after PR #2916 added SharePoint's baseline `primaryKey`, which flips SharePoint's push from insert to update and tripped the latent null on the very next deploy. Set the unspecified fields to the `-1` "no-batching" sentinel already used by NetForum/Path LMS/PropFuel; SharePoint keeps its baked `BatchRequestWaitTime=250` so its update is a no-op. `NavigationBaseURL` nulls elsewhere (iMIS/NetForum/Nimble) are unaffected — that column is nullable. An audit of all NOT-NULL-with-default columns across every connector confirms these batch fields were the only such nulls.

- 6a3288b: feat(connectors): add the SharePoint (Microsoft Graph) and Microsoft Dynamics 365 (Dataverse) connectors

  Two connectors added to the v2 unified set, each extending `BaseRESTIntegrationConnector` with the per-operation CRUD + incremental-watermark contract:
  - **SharePoint** — Microsoft Graph v1.0; sites / drives / lists / listItems with soft PKs proven from the Graph schema, delta-token incremental sync (the deltaLink token as the watermark, not a timestamp), and an FK graph via push-time `@lookup` (`&IntegrationID=@parent:IntegrationID`).
  - **Microsoft Dynamics 365 (Dataverse)** — Dataverse Web API (OData) with entity discovery, pagination, and change-tracking incremental sync.

- 6ac8ca4: feat(integration): v2 integration framework + unified connector set (GrowthZone, OpenWater, ORCID, PropFuel, Path LMS)

  Consolidated integration-v2 work — framework hardening + five connectors — proven end-to-end via the
  GraphQL stand-up path (clean DB, CreateConnection → ApplyAll → StartSync) on SQL Server.

  **Integration core (`integration-engine`, `integration-engine-base`, `integration-schema-builder`):**
  - Deterministic §4 content-hash identity stamp for keyless rows (stable storage key + idempotent re-sync).
  - Door-before-child dependency ordering derived from soft-FK `parentObjectName`/`ReferencedType` — children
    land in one pass (no ZERO_PARENTS, no second-sync self-heal).
  - Adaptive rate-limit hooks (`RateLimitAcquire`/`Report`/`MaxConcurrency`) on `FetchContext`.
  - Shared `auth-helpers` (`OAuth2TokenManager`); `KeySerialization`/`RecordFlatten` committed (were
    imported-but-untracked — fresh clones could not build); `IntegrationEngineBase.SeedForTesting` for
    offline replay harnesses.

  **Schema correctness + sizing (`integration-engine`, `integration-schema-builder`):**
  - `json`/`text`/`array`/`object` and unsized strings map to `NVARCHAR(MAX)`/unbounded text instead of
    being collapsed to `nvarchar(255)` — a nested-array JSON or long field routinely exceeds 255 and was
    dropped at sync time (OpenWater `Program.rounds` went from **0** rows to all of them). Bounded scalar
    strings keep a small, space-efficient size (255 floor; declared length + headroom when the source
    reports one; PK strings capped at the dialect index-key limit). Soft-PK columns are emitted nullable.
  - String-overflow is **skip-and-surface** (`STRING_OVERFLOW_SKIPPED` SyncWarning via the new
    `StringOverflowError`), not truncate or fail-the-batch.
  - **Active-only materialization (phantom-skip):** `buildSourceSchemaFromPersistedRows` materializes only
    `Status='Active'` objects/fields — no empty phantom tables, no wasted per-entity CodeGen/advancedGen cost.

  **StartSync honesty (`server`):**
  - `IntegrationStartSync` no longer returns optimistic `{Success:true, RunID:null}` for fast/no-op syncs;
    it resolves the run by recency over a bounded poll (real `RunID`), and returns `Success:false` with a
    message when no run record appears.

  **Soft-PK config cache (`codegen-lib`):**
  - `RunInProcess` invalidates `ManageMetadataBase`'s soft-PK/FK config cache per in-process run — the
    path-keyed cache went stale in the long-lived MJAPI RSU CodeGen path ("No primary key found" → entity
    never created → 0 rows synced until restart). Deterministic; the CLI `Run()` path is unchanged.

  **Unified connector set (`integration-connectors`):**
  - **GrowthZone** — OAuth2, 38 objects, idempotency + probe-amended pagination metadata.
  - **OpenWater** — 25 objects, OpenAPI-complete.
  - **ORCID** — 12 per-record objects, public-API live-verified.
  - **PropFuel** — file-feed slice (rich REST API documented out-of-scope).
  - **Path LMS (Blue Sky eLearn)** — GraphQL Reporting API, pull-only; GraphQL over `/graphql`, two-step
    app-credential → bearer auth; credential-free discovery from the public SpectaQL schema (84 record
    types / 1175 fields); per-object `AccessPath` walks the 16 GraphQL query doors to leaf records;
    content-hash idempotency.
  - All five validated under the v2 architecture (RealityProbe / completeness-diff / T12 idempotency).

  **Migration + metadata (additive schema → minor):** ships forward migration(s) + integration metadata
  seeds; additive only — no column drops, narrowing, renames, or new required params — backward-compatible
  **minor** per the publish-then-no-breaking-changes policy.

- 6520bea: Add MemberSuite (AMS) integration connector — REST API v2, 196 objects / ~6,000 fields extracted credential-free from MemberSuite's public module swaggers (CRM/membership/events/fundraising/financial). Signed-request auth via auth-helpers, narrow Activity/Certification write surface, runtime custom-field/saved-search discovery, full-record pass-through. Adds the `MemberSuite API` credential type. Also adds the additive `OAuth2TokenRequest.ExtraParams` field required by the existing RhythmConnector (engine patch).
- 675b8b8: Clean-deploy metadata for the NetForum and SharePoint connectors. Add the baseline Integration `primaryKey` to each per-folder connector (so `mj sync push` updates the surviving baked Integration instead of inserting a duplicate — avoids the `UQ_Integration_Name` collision), add delete-seeds that `deleteRecord` the old baked IOs (18 NetForum + 13 SharePoint, keyed on their deterministic baseline IDs), and remove the leftover flat-file duplicates (`.netforum.json` / `.sharepoint.json` — per-folder is canonical). Mirrors the existing GrowthZone/iMIS/Nimble/PropFuel/Salesforce clean-deploy pattern so a fresh install deploys these two connectors without collisions or orphaned objects.
- 5ebf0e9: Add the netFORUM Enterprise (Community Brands AMS) connector — xWeb SOAP/XML route.
  - **`NetForumConnector`** (`@memberjunction/integration-connectors`): integrates netFORUM Enterprise via the xWeb SOAP/XML web service (`netForumXML.asmx`), implemented as SOAP-over-HTTP on `BaseRESTIntegrationConnector`. Two-step `Authenticate` token auth; `GetQuery`/`GetQueryDefinition`/`ExecuteMethod` reads; per-facade `*_last_updated_dt` incremental watermarks; facade CRUD where the xWeb docs establish it. The standard Enterprise object model (34 Integration Objects) is Declared from the public xWeb WSDL; customer-specific queries/views/custom columns are runtime-discovered via `GetQueryDefinition` (`DiscoveryIsAuthoritative=false`), never baked into the connector.
  - **`@memberjunction/integration-engine`**: adds the optional `OAuth2TokenRequest.ExtraParams` field (extra `application/x-www-form-urlencoded` grant-body params, e.g. Auth0 `audience`), forwarded by `OAuth2TokenManager` with standard params taking precedence. This is the engine half of the OAuth2 change `RhythmConnector` already depends on.

  > **Note:** netFORUM's denormalized facades (e.g. `Individual`, `FundraisingGift`) can exceed SQL Server's hard 1024-column-per-table limit when fully flattened; those objects need column-overflow handling at the framework level before they can materialize as single tables.

- 4027e6f: Add the **Novi AMS** connector — a read+write integration for the Novi association-management system's public REST API.
  - **`NoviConnector`** (`@RegisterClass(BaseIntegrationConnector, 'NoviConnector')`, `IntegrationName` = `"Novi AMS"`) extends `BaseRESTIntegrationConnector` and rides the generic per-operation CRUD path. Novi-specific overrides: `BuildHeaders` (`Authorization: Basic <rawApiKey>` — the raw key after `Basic `, not base64 user:pass), per-tenant `GetBaseURL` resolved from `CompanyIntegration.Configuration` (Novi has no shared host — each org is `https://www.<assoc>.org/api/`), `NormalizeResponse` for both envelopes (`{TotalCount, Results}` lists, `{data}` details), offset `ExtractPaginationInfo`/`BuildPaginatedURL` (`pageSize` + `offset`), `RateLimitPolicy`/`ExtractRetryAfterMs` (20/s · 600/min · 100k/day), a `FetchChanges` that emits each object's `IncrementalWatermarkField` and advances only on full-batch success, and a GET-then-merge-then-PUT `UpdateRecord` (Novi PUT is full-object replacement, no PATCH). `ExtractIDFromResponse` reads Novi's `UniqueID`/`<Object>UniqueId` keys and still routes creates through `BuildCreatedResult`.
  - **Metadata** (`metadata/integrations/novi/.novi.integration.json`): 32 Integration Objects / 387 fields covering members, member types, activities, groups, committees (+roles/members), events, tickets, registrations, attendees, orders (+items), products (+purchases), subscriptions, custom fields (definitions + per-customer values), credit types, webhooks, articles, static pages, NPS surveys, and lookups — with per-operation CRUD columns, offset pagination, incremental watermarks, and FK relationships. Passes the bijection, dag-completeness, and fk-lookup-qualifier floor graders.
  - 20 vitest unit tests (`NoviConnector.test.ts`).

  Built and verified credential-free via the connector workshop. **Ceiling: sync-verified** — beyond matching Novi's published API (api-docs.noviams.com + the official Postman collection), the connector passes the full credential-free verification surface on SQL Server (real MJ engine, mock Novi vendor, real DB):
  - **Verification ladder T0–T6 all green** (T0 tsc, T1 structural invariants, T2 cross-pass consistency, T3 doc self-check over 32 objects, T4 vitest 20/20, T5 mock-HTTP 32 objects/61 records, T6 SQLite create/update/delete/ordering). T7 (OpenAPI) and T8 (live) are N/A — Novi publishes no OpenAPI spec and live testing needs a customer API key.
  - **Read sync over ALL 32 objects**: `ApplyAll` builds 32 tables + entity maps; forward sync 100% complete and rowcount-asserted per object; idempotent re-run with content-hash incremental narrowing; child-path objects (GroupMember/CommitteeMember via parent chain) and derived line-items (OrderItem/ProductPurchase) all sync.
  - **Write paths**: delta create/update/delete (5/5) and a full bidirectional create→update→delete round-trip (7/7) through the connector's CRUD.
  - DAG: 32 objects / 26 FK `@lookup` edges / **0 cycles**.

  Not yet live/production-verified: a round-trip against a real Novi tenant needs a customer API key (the credential boundary). Tenant-specific behavior (API-key field/group exposure, custom fields, QuickBooks/SSO setup, real rate-limit/error shapes) is deferred to runtime discovery. OAuth2/OIDC SSO and the QuickBooks-direct/Zapier routes are intentionally out of scope (recorded in the Integration `Configuration`).

- e8be085: Add the Rhythm Software (Rhythm AMS) connector — REST + OAuth2/OIDC via Auth0. The catalog is spec-derived from Rhythm's 15 public OpenAPI specs across all 14 modules: **377 Integration Objects / 14,515 fields** (no invention; tenant-specific custom fields / saved queries / event streams / SSO deferred to runtime).
  - Per-object **read-style classification** (list / POST-search / fk-child / by-id) derived from each module's spec
  - **POST-search listing**, **fk-child parent-traversal**, generic per-operation **CRUD**, DynamoDB-style **cursor pagination**, **content-hash idempotency**
  - **Single-origin `BaseURL`/token override** (a proxying gateway or the credential-free e2e mock; real tenants leave it unset)
  - New `Rhythm OAuth2` credential type

  Verified credential-free (mock vendor through the real MJ engine on SQL Server): contract ladder T0–T5/T7/T12 (T7 1,446/1,446 declared paths match the specs), all 273 bulk objects ApplyAll'd + synced (284 tables, 571/571 cells, 0 failures), and the 17-cell behavioral matrix REAL (forward / idempotent / delta / pagination / DAG 377-108-4-0 / merkle / rate-limit / retry / concurrency / bidirectional write round-trip). Ceiling is contract/mock-verified — not live-vendor or Postgres. Requires `@memberjunction/integration-engine` auth-helpers `OAuth2TokenRequest.ExtraParams` (Auth0 audience).

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [6ac8ca4]
- Updated dependencies [6520bea]
- Updated dependencies [5ebf0e9]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/integration-engine@5.42.0
  - @memberjunction/integration-engine-base@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/integration-engine@5.41.0
  - @memberjunction/integration-engine-base@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/integration-engine@5.40.2
- @memberjunction/integration-engine-base@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/integration-engine@5.40.1
  - @memberjunction/integration-engine-base@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/integration-engine@5.40.0
  - @memberjunction/integration-engine-base@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- a1e2776: Add an idempotent `Upsert` verb to integration connectors, implemented for HubSpot contacts.

  **Engine** (`integration-engine`): a new CRUD verb alongside Create/Update/Delete — a `SupportsUpsert` capability getter and a default-throwing `Upsert(ctx)` on `BaseIntegrationConnector`, a new `UpsertRecordContext` type (carries `Attributes` plus an optional `IDProperty` override of the upsert key), and an optional `UpsertKey` field on `IntegrationObjectInfo` so objects can declare their natural unique business key. Purely additive: existing connectors inherit the throwing default, `UpsertKey` is optional, and the action-generator verb set is unchanged (no auto-generated Upsert action).

  **HubSpot** (`integration-connectors`): `HubSpotConnector` overrides `Upsert` for contacts. This defines an error out of existence — a search-then-create sequence has a window in which a concurrent writer can create the same email-keyed contact, yielding `409 Contact already exists`; rather than catch and special-case that 409, `Upsert` issues a single idempotent call to `POST /crm/v3/objects/<object>/batch/upsert` with a batch of one (`idProperty`/`id` per input, `id` = the upsert-key value), which creates-on-missing and updates-on-existing without a 409, removing the race window entirely. The `idProperty` defaults from the object's `UpsertKey` metadata (`email` for contacts) and is overridable per call. It uses the write-verb error pattern: it never trusts a bare 2xx (a batch envelope reporting `numErrors`, a non-`COMPLETE` status, empty `results`, or a result with no object id all surface as `Success:false`), and a missing key/value fails with a 400 before any API call.

  Note: the single-record `PATCH /crm/v3/objects/contacts/{email}?idProperty=email` was verified live to NOT create-on-missing (404), so the batch/upsert-of-one is the correct single-call idempotent path; the documented multi-input batch caveats (whole-batch 409, no partial upserts) do not apply at size one.

- 93a99a4: Fix HubSpot association create silently failing. `CreateAssociation` previously derived the association direction from the API path segment order and sent an empty `types: []`, which HubSpot accepts with a 2xx but creates zero associations; it then trusted the bare 2xx and reported success. The create now sends an explicit wire direction with a resolved `HUBSPOT_DEFINED` association type (hardcoded for verified pairs, resolved at runtime via the `/labels` endpoint otherwise), validates the response body (`status`, `results`, `errors`/`numErrors`) instead of the HTTP status, and keeps the stored composite ExternalID in a stable order so create/pull/delete agree. Applies across all association object types; delete maps the stored key to the same wire direction.
- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [a1e2776]
- Updated dependencies [3c53858]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/integration-engine@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/integration-engine-base@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/integration-engine@5.38.0
  - @memberjunction/integration-engine-base@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/integration-engine@5.37.0
  - @memberjunction/integration-engine-base@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Minor Changes

- 97270c7: Consolidate 17 in-flight connector implementations onto a single working baseline against current `next`, with credential-type completeness and bug fixes. Brings net-new connectors for Aptify, Betty, Blackbaud, ConstantContact, GrowthZone, iMIS, MagnetMail, Mailchimp, MJToMJ, NetForum, NetSuite, NimbleAMS, Personify360, PropFuel, Reach360, SharePoint, and WildApricot — plus Rasa updates from the GrowthZone/Rasa branch. The 6 production connectors (HubSpot, QuickBooks, Salesforce, SageIntacct, YourMembership, Wicket) stay at `next` baseline; FileFeed + RelationalDB unchanged. Each new connector ships with: identity metadata + credential-type declaration + smoke tests asserting identity and capability flags + watermark-aware FetchChanges + real CRUD method bodies (no 501-stubs; capability flags accurately reflect what the connector implements). Adds 12 missing credential-type entries with vendor-accurate field schemas (`isSecret` correctly marked, required vs optional honest to what each connector's `LoadCredentials` reads): Aptify Authentication, Betty API, Blackbaud SKY API, Constant Contact OAuth, GrowthZone API, iMIS OAuth, MagnetMail API, Mailchimp API Key, MJ API Key, NetSuite TBA, PropFuel API Key, Wild Apricot OAuth. Fixes credential-data leakage in MJAPI logs: HubSpot + Rasa connectors no longer log credential-derived metadata (token length) on every authenticate call. Fixes HubSpot OAuth-vs-API-Key language: the connector's auth IS a Private App access token (API Key auth, Bearer header), not an OAuth flow — interface jsdoc + class jsdoc + 403 error message updated to reflect that accurately (metadata already declared `CredentialTypeID=API Key` correctly). Fixes Rasa credential-type case mismatch (was `Rasa.io API` → corrected to canonical `rasa.io API`). 26 connectors build clean. Vitest: 25 test files, 217 passed, 26 skipped, 0 failed. The per-vendor deeper enhancement work (richer custom-field discovery in DiscoverFields, more incremental endpoints declared with provable watermarks, bidirectional refinements) is iterative and planned for follow-up PRs.

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/integration-engine@5.36.0
  - @memberjunction/integration-engine-base@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/integration-engine@5.35.0
  - @memberjunction/integration-engine-base@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/integration-engine@5.34.1
  - @memberjunction/integration-engine-base@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/integration-engine@5.34.0
  - @memberjunction/integration-engine-base@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/integration-engine@5.33.0
  - @memberjunction/integration-engine-base@5.33.0
  - @memberjunction/core-entities@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/integration-engine@5.32.0
  - @memberjunction/integration-engine-base@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/integration-engine@5.31.0
  - @memberjunction/integration-engine-base@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/integration-engine@5.30.1
- @memberjunction/integration-engine-base@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Minor Changes

- e7e6bf5: fix(metadata): replace stale `IsForeignKey` flag with `RelatedIntegrationObjectFieldName` in salesforce metadata

  `metadata/integrations/.salesforce.json` had 1,395 fields with `"IsForeignKey": true` — a property that does not exist on the `MJ: Integration Object Fields` entity. Every `mj sync` run failed validation with:

  ```
  Field "IsForeignKey" does not exist on entity "MJ: Integration Object Fields"
  ```

  Blocked any push to `next` that touched the metadata directory.

  The entity already exposes the FK linkage via `RelatedIntegrationObjectFieldName` (and `RelatedIntegrationObjectID` for the resolved target). Salesforce FKs always reference `Id` on the target sObject, so this PR transforms each `"IsForeignKey": true` into `"RelatedIntegrationObjectFieldName": "Id"` — preserving the FK signal using a real entity field that mj-sync will accept.

  The salesforce connector's metadata generator should be updated in a follow-up to emit `RelatedIntegrationObjectFieldName` directly instead of the deprecated `IsForeignKey` flag.

- 9154ac7: feat(integration): Salesforce + Sage Intacct pipeline hardening

  **This is in-progress work — not ready to merge.** PR is open for incremental review and discussion.

  ### Sage Intacct connector
  - Range-chunked walk over `RECORDNO` for numeric-PK objects, replacing the previous PK-cursor strategy that silently dropped records when SI's natural scan order wasn't PK-ascending.
  - Upper-bound discovery via exponential probe so termination is exact (not heuristic).
  - Sub-range verification on every completed chunk (independent count of two halves must sum to the parent's count) to catch SI inconsistencies that would otherwise silently undercount.
  - Discovery-probe retry with backoff for transport-only errors; immediate fail-stop on SI API errors (permissions, schema, syntax).
  - `WHENMODIFIED` filter values normalized to SI's `MM/DD/YYYY HH:mm:ss` format — the engine sometimes passes ISO 8601 which SI rejects with `DL02000001`.
  - Bumped `DEFAULT_PAGE_SIZE` from 100 to 1000 (proven safe via probing); legacy single-pull path now hard-fails on full-page-no-resultId instead of silently dropping records via PK-cursor.

  ### Salesforce connector
  - Removed dead `queryLocator` member field. `if (this.queryLocator && ctx.CurrentCursor)` was always false (member never assigned), so every "next batch" call re-executed the original SOQL and returned the same first page until the engine's duplicate-batch guard aborted the entity. Continuation now uses `ctx.CurrentCursor` directly via `FetchNextPage`.
  - Per-batch dedup by `Id` for system metadata sObjects (TabDefinition, FormulaFunctionAllowedType) where SF returns multiple records sharing the placeholder Id `000000000000000AAA`. Drops are logged once per object instead of producing N per-record `UQ_<table>_PK` constraint violations.
  - Removed the over-aggressive `!obj.createable` filter on `isUserRelevantSObject`. Many SF objects are flagged non-createable but carry real customer data (rollups, attachment-link junctions, history-style records).
  - `BuildSOQLQuery` no longer emits `LIMIT batchSize` — that was silently capping every full result set at the page size. Pagination is via SF's native `done` / `nextRecordsUrl`.
  - Watermark comparison uses `>=` instead of `>` so records modified at exactly the watermark instant aren't dropped on the next sync.

  ### IntegrationEngine
  - New typed `SchemaNotGeneratedError` (and `detectSchemaNotGenerated` helper) — `CreateRecord`/`UpdateRecord` now detect the SQL Server `Could not find stored procedure` pattern, throw the typed error, and `ProcessPullSync` fail-stops the entire EntityMap with one `[CONFIGURATION_ERROR]` log line + remaining records marked skipped. Previously every record produced an identical per-record error, drowning sync reports in O(records) duplicates.

  ### Picker → ApplyAll resolver fixes (`IntegrationDiscoveryResolver`)
  - New `resolveSourceObjectsToNames` per-item ID/Name fallback resolver. The old `resolveSourceObjectNames` only honored the IDs path and silently discarded any selection that arrived with `SourceObjectName` only (typical for newly-discovered objects with no IntegrationObject row yet). Real-world impact: 1,156 picker selections were collapsing to 420 IntegrationObjects to 181 generated tables. `LogError` now fires on truly unresolvable selections.
  - `buildTargetConfigs` collects every silent skip into three buckets (`notInSchema`, `noFields`, `noPK`) and emits a single summary line per call: `[buildTargetConfigs summary] requested=X, accepted=Y, dropped=Z (...)`. Lossy stages in the pipeline are now greppable.

  ### SchemaEngine RSU pipeline
  - `executeMigration` chunks oversized migration SQL (>32KB) into batches of 25 statements per `ExecuteSQL` call. Salesforce-class schemas (1100+ tables) produce migrations with 17K+ ALTER TABLE statements as a single batch, which exceeded mssql's client request timeout (30s). Each chunk now resets the timeout clock.

  ### Other
  - `IntegrationSchemaSync` and `IntegrationApplyAllBatch` plumbing for filtered IntrospectSchema flow (Salesforce-only path that describes selected objects rather than a full-org probe).
  - Integration dashboard UI tweaks (connections page rendering for high-FK supertype entities).

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [9154ac7]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
- Updated dependencies [216ddc3]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/integration-engine@5.30.0
  - @memberjunction/integration-engine-base@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/integration-engine@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Minor Changes

- 1d62875: feat: bidirectional sync engine, HubSpot/YM connector improvements, RSU #2239 fixes
  - Integration engine now respects SyncDirection (Pull/Push/Bidirectional) on entity maps
  - Push sync uses Record Changes to detect MJ-side modifications, reverse-maps fields, and calls connector CRUD methods
  - Separate Push watermarks tracked alongside Pull watermarks
  - New IntegrationWriteRecord GraphQL mutation for ad-hoc writes to any connector
  - HubSpot: 130 objects with full field metadata; association CRUD via v4 PUT/DELETE API; composite hs_object_id for association sync
  - YourMembership: 228 objects with accurate PKs across all endpoints; 400 errors now surfaced (not silently swallowed); DateTime.MinValue → null conversion
  - SchemaBuilder logs DDL history to \_\_mj_integration.SchemaHistory (separate schema, not surfaced as MJ Application)
  - IntegrationObject.IsCustom column added to distinguish static vs runtime-discovered objects
  - RSU #2239: in-process SQL execution for CodeGen (no sqlcmd dependency)
  - RSU #2239: RSU_RESTART_COMMAND env var override for non-PM2 environments
  - SQLServerDataProvider: incremental schema sync improvements

### Patch Changes

- Updated dependencies [1d62875]
- Updated dependencies [115e4da]
  - @memberjunction/integration-engine@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/integration-engine@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/integration-engine@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/integration-engine@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/integration-engine@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/integration-engine@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/integration-engine@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/integration-engine@5.22.0
  - @memberjunction/core-entities@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/integration-engine@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/integration-engine@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/integration-engine@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/integration-engine@5.18.0
- @memberjunction/core@5.18.0
- @memberjunction/core-entities@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [bbfbf5e]
- Updated dependencies [9881045]
  - @memberjunction/integration-engine@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/integration-engine@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Minor Changes

- 95a7b8e: metadata
- ee64a9a: metadata

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/integration-engine@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Minor Changes

- 140fc6d: Add HubSpot v4 association fetch, fix empty-string-to-null coercion for HubSpot datetime fields, widen GetCachedObject/GetCachedFields visibility to protected, and fix OpenAI streaming max_completion_tokens parameter

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/core@5.14.0
  - @memberjunction/integration-engine@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/integration-engine@5.13.0
  - @memberjunction/core-entities@5.13.0

## 5.12.0

### Minor Changes

- 6f9350c: migration
- 257512b: feat: Integration scheduled job type, YM/HubSpot connector improvements, CodeGen custom view refresh
  - Add ScheduledJobRunID FK to CompanyIntegrationRun and ScheduledJobID FK to CompanyIntegration (migration v5.12.x)
  - Add Integration Sync scheduled job type metadata
  - Pass contextUser through HubSpot credential loading for proper server-side data isolation
  - Make YM connector performance defaults (retries, timeouts, batch size, throttle) overrideable per Configuration JSON
  - CodeGen now auto-emits sp_refreshview for custom base views (BaseViewGenerated=false) so devs don't need to add it manually to migrations
  - BaseIntegrationPointAction scaffold for future write-back actions

- 492de8e: Add Rasa.io newsletter platform integration connector with sync support for persons, posts, insight actions, and insight topics. Includes credential type metadata and integration object definitions.

### Patch Changes

- 93a9f7d: Update YourMembership connector watermark tests to match simplified FetchMemberBatch that delegates pagination to the engine instead of filtering client-side.
- Updated dependencies [6f9350c]
- Updated dependencies [05f19ff]
- Updated dependencies [257512b]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/integration-engine@5.12.0
  - @memberjunction/core@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/integration-engine@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/integration-engine@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/integration-engine@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Minor Changes

- 89b6abe: migration

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [89b6abe]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/integration-engine@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/integration-engine@5.8.0
  - @memberjunction/global@5.8.0
