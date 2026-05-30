## ADDED Requirements

### Requirement: Migration run-set definition (baseline-anchored)
To bring a database to a target version **T**, `mj migrate` SHALL run, in Flyway version order:

1. **B\*** — the single most recent baseline script whose version is at or before **T** (the `B`-script that sorts last among baselines at/below T), then
2. every `V`-script whose version is **greater than B\*** and at or before **T**.

In short, the run set is **B\* followed by `{ V : version(B\*) < version(V) ≤ T }`**. No script at or below `version(B*)` — other than `B*` itself — is ever fetched or run, because a baseline is a complete, zero-dependency snapshot that already encapsulates everything up to its own version. When **T** is the published `main` branch, **T** is the newest available version, so `B*` is the newest baseline overall and the `V`-tail is every versioned migration created after it.

Operationally: the two bounds are enforced by two independent mechanisms — fetching at the git ref for **T** caps the set at the **top** (only migrations that exist at/below T are present), and selecting the latest baseline caps it at the **bottom**. Ordering and "latest baseline" SHALL be determined by Flyway's version key (the numeric `<timestamp>` token in the `B<timestamp>__…` / `V<timestamp>__…` filename), not by the human-readable `vX.Y` tag in the description.

#### Scenario: Fresh database, multiple baselines available
- **WHEN** the repo at the target ref contains baselines `B(v3.0)`, `B(v4.0)`, `B(v5.0)` and the target is v5.10
- **THEN** the run set is `B(v5.0)` followed by every `V` with version in (v5.0, v5.10], and `B(v3.0)`, `B(v4.0)`, and all `V` ≤ v5.0 are neither fetched nor run

#### Scenario: Target falls between baselines
- **WHEN** baselines `B(v3.0)`, `B(v4.0)`, `B(v5.0)` exist and the target is v4.5
- **THEN** `B*` is `B(v4.0)` and the run set is `B(v4.0)` plus every `V` in (v4.0, v4.5]

#### Scenario: Target is the published main branch
- **WHEN** `mj migrate` targets `main` (the latest published version)
- **THEN** `B*` is the newest baseline in the repo and the run set is that baseline plus every `V` created after it, up to the main tip

#### Scenario: Target version has no baseline at or below it
- **WHEN** the target is in a line with no `B`-baseline at or below it (e.g. legacy v2.x, which has no baseline)
- **THEN** there is no `B*`, and the run set is the full versioned history at/below T applied in order

#### Scenario: Ordering uses the timestamp token, not the vX.Y tag
- **WHEN** selecting `B*` and the `V`-tail
- **THEN** comparison uses the numeric `<timestamp>` filename token (Flyway's version key), so a baseline whose timestamp is "last consolidated V + 1 minute" correctly sorts after the stack it replaces and before the tail

### Requirement: Partial-clone fetch of only the selected slice
The migration fetch SHALL use a git partial clone (`--filter=blob:none`) and check out only the selected migration files, so that blobs for unselected migrations are never downloaded.

#### Scenario: Only selected blobs transferred
- **WHEN** the slice for a target resolves to a baseline plus three tail migrations
- **THEN** only those files' blobs are downloaded, not the entire migrations directory

#### Scenario: Partial clone unsupported
- **WHEN** the git server or client does not support blobless partial clone
- **THEN** the command falls back to a shallow sparse clone of the migrations directory and logs that the fallback path was taken

### Requirement: Existing-database fetch trimming
For a database that already has applied migrations, `mj migrate` SHALL be able to limit the fetch to migrations newer than the database's current recorded `flyway_schema_history` version.

#### Scenario: Existing database upgraded by one version
- **WHEN** `mj migrate` runs against a database already at version N targeting N+1
- **THEN** the command fetches only the migration(s) with version greater than N

### Requirement: Sliced fetch is consistent with the engine's baseline subsumption
The fetched slice SHALL be consistent with how the migration engine (Skyway) resolves migrations. Skyway auto-selects the highest baseline present and subsumes every migration at or below that baseline, so a slice containing the highest baseline plus the versioned tail (plus repeatables) is sufficient and does not cause resolution or validation failures for the omitted (subsumed or already-applied) migrations. The CLI SHALL NOT need an `ignore-missing-migrations` style escape hatch, because the omitted files are exactly those the engine already disregards.

#### Scenario: Sliced set resolves without error
- **WHEN** Skyway resolves migrations against a local set that omits subsumed (≤ baseline) or already-applied migrations
- **THEN** resolution succeeds and only the appropriate migrations run

### Requirement: Dialect-aware migration source
`mj migrate` SHALL select the migration source location and baseline filename convention based on the configured database platform (`migrations/` for SQL Server, `migrations-pg/` for PostgreSQL).

#### Scenario: PostgreSQL target
- **WHEN** the configured platform is PostgreSQL
- **THEN** the fetch reads from `migrations-pg/` rather than `migrations/`

### Requirement: Default to latest, temp-dir cleanup
`mj migrate` SHALL default to the latest version invariant (or the install-pinned version) when no `--tag` is given, and SHALL remove any temporary clone directory it creates on every exit path, including failures.

#### Scenario: No tag provided on existing instance
- **WHEN** `mj migrate` runs without `--tag` on an installed instance
- **THEN** it targets the pinned/latest version and brings the database current

#### Scenario: Temp directory removed after run
- **WHEN** a migration fetch creates a temporary clone directory
- **THEN** that directory is removed whether the migration succeeds or fails
