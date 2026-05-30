## ADDED Requirements

### Requirement: On-demand distribution bundle generation
A new `mj bundle` command SHALL produce a self-contained installer zip from a target ref, containing the installable code directories and configuration needed for an offline/air-gapped installation. The output SHALL be written to a user-specified path and SHALL NOT be committed to any repository.

#### Scenario: Bundle from a release ref
- **WHEN** a user runs `mj bundle --tag v2.123.0 --out ./mj-install.zip`
- **THEN** the command produces a self-contained zip at that path for the specified release

#### Scenario: Bundle defaults to latest
- **WHEN** a user runs `mj bundle` without `--tag`
- **THEN** the command bundles the latest version invariant

### Requirement: Offline install path parity
A zip produced by `mj bundle` SHALL contain everything an offline `mj install` needs so that extraction plus install succeeds without network access to the canonical repo.

#### Scenario: Air-gapped install from bundle
- **WHEN** a `mj bundle` zip is extracted on a host without canonical-repo network access and `mj install` is run there
- **THEN** the install completes using only the bundled contents

### Requirement: Optional inclusion of migrations
`mj bundle` SHALL support including the migration slice needed to stand up the bundled version so that an air-gapped `mj migrate` can run without fetching from the canonical repo.

#### Scenario: Bundle with migrations for air-gapped migrate
- **WHEN** a user requests a bundle that includes migrations for the target version
- **THEN** the zip contains the baseline-plus-tail migration slice for that version

### Requirement: Replace the committed distribution artifact
The committed `Distributions/MemberJunction_Code_Bootstrap.zip`, the `Distributions/.gitignore` rule that un-ignores it, the `CreateMJDistribution.js` generator, and the release-pipeline step that regenerates and commits the zip SHALL be removed; `mj bundle` is the replacement.

#### Scenario: No committed zip after change
- **WHEN** the change is applied
- **THEN** the repository no longer tracks a distribution zip and the release pipeline no longer commits one

#### Scenario: Bundle reproduces prior artifact
- **WHEN** a maintainer needs the distribution artifact previously produced by `CreateMJDistribution.js`
- **THEN** `mj bundle` produces an equivalent self-contained zip on demand
