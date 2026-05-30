## ADDED Requirements

### Requirement: Remote fetch of installable code directories
`mj install` SHALL obtain the installable code directories (`MJAPI`, `MJExplorer`, `GeneratedEntities`, `GeneratedActions`, `SQL Scripts`) by fetching them from the canonical MemberJunction repository at a target ref, rather than requiring them to pre-exist in the working directory. The fetch SHALL use a git partial clone (`--filter=blob:none`) with sparse-checkout limited to those directories, and SHALL exclude paths the canonical repo does not need at install time (e.g. `SQL Scripts/generated/**` and the kendo license file).

#### Scenario: Fresh install with empty working directory
- **WHEN** a user runs `mj install` in an empty directory with network access
- **THEN** the command fetches the installable code directories from the canonical repo at the resolved ref and proceeds with bootstrap without raising a "required package not found" error

#### Scenario: Generated/built artifacts are not fetched
- **WHEN** the install fetch runs
- **THEN** `node_modules/`, `dist/`, and generated output directories are absent from the fetched tree because the canonical repo does not track them

#### Scenario: Network unavailable
- **WHEN** `mj install` cannot reach the canonical repo
- **THEN** the command fails with an explicit error that names the unreachable repo and points the user to `mj bundle` for offline installation

### Requirement: Default to latest version with pin override
`mj install` SHALL target the latest version invariant (the configured release branch tip) when no `--tag` is provided, and SHALL target the specified release when `--tag vX.Y.Z` is provided.

#### Scenario: No tag provided
- **WHEN** a user runs `mj install` without `--tag`
- **THEN** the command resolves the configured release branch tip as the target ref

#### Scenario: Explicit tag provided
- **WHEN** a user runs `mj install --tag v2.123.0`
- **THEN** the command targets exactly that release ref for the code fetch

### Requirement: Resolve and pin the installed version
After resolving the target ref, `mj install` SHALL record the concrete resolved version into `mj.config.cjs` so that later `mj migrate` runs target the same version as the installed code.

#### Scenario: Pin written after install
- **WHEN** `mj install` completes a fetch from the release branch tip
- **THEN** the concrete resolved version is written to `mj.config.cjs`

#### Scenario: Migrate consistency after install
- **WHEN** `mj migrate` runs after install with no `--tag`
- **THEN** it uses the version pinned by install rather than independently re-resolving the branch tip

### Requirement: Preserve existing bootstrap behavior
After fetching code, `mj install` SHALL perform the existing bootstrap steps unchanged: npm install for `GeneratedEntities`, write `.env`, npm-link generated packages into `MJAPI` and `MJExplorer`, rename `SQL Scripts/generated/MJ_BASE` to the configured database name, run CodeGen, and patch MJExplorer environment files.

#### Scenario: Bootstrap runs after fetch
- **WHEN** the code fetch completes
- **THEN** the command runs the established bootstrap sequence and reports "Installation complete!" on success
