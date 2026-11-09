# Idea 2: Backup & Restore Assurance Layer

**Week of 2026-09-26 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

Every organization running MJ believes it has backups. Almost none of them know, with any confidence,
that those backups actually restore. This gap is not specific to MJ or to any one industry — it is
one of the most well-documented, least-fixed problems in operations generally: **62% of organizations
fail to run regular backup-and-restoration exercises**, the average organization hasn't verified a
restore in **18+ months**, and only half of businesses test disaster-recovery plans annually at all.
For a lean nonprofit or association running its entire member/donor system of record on one shared
database, the failure mode is not abstract. One documented case: a nonprofit had never once tested a
restore; a ransomware event froze four offices; the backup set turned out to be **corrupt**; the
organization paid **$22,000** in third-party recovery costs and lost **four days** of operations before
it could serve a member again. The database MJ manages for an organization like that — the donor
history, the membership records, the event registrations — is not a nice-to-have system; for many
of these organizations it *is* the organization's institutional memory. A backup nobody has verified
is not a safety net. It's a belief.

MJ today has an opinion about almost everything that touches its own data — schema, permissions, audit
trails, even (per this log's prior weeks) tenant isolation and encryption key lifecycle. It has **zero**
opinion about whether the backups protecting all of that are actually restorable. There is no entity
for it, no scheduled job for it, no dashboard signal for it. An organization running MJ today has
exactly the same "we believe it works" posture the disaster-recovery research says is nearly
universal and nearly always wrong when tested.

## What already exists (and why this doesn't duplicate it)

- **Issue #2580** ("Legacy Backup POC pathway strategy") looks adjacent but solves a **different**
  problem: it is a process document for standing up a *new* MJ proof-of-concept from a *client's
  legacy system's* backup file (SQL Server `.bacpac`/`.bak`, Postgres dumps) — onboarding tooling, not
  operational assurance. It says nothing about verifying that an *existing, live MJ deployment's own*
  backups restore correctly on an ongoing basis. This proposal doesn't touch that pathway.
- **The `bootstrap-clean-db` skill** (this repo) builds a fresh MJ database *from the repo's own
  migrations and metadata* to verify the schema builds cleanly — it answers "does our migration
  history produce a correct schema," a build-correctness question. This proposal answers a completely
  different question: "does *this organization's actual backup, of their actual live data*, restore to
  something usable" — an operational-recoverability question about data that already exists, not
  about migration correctness. The two share a "spin up a disposable database and check it" mechanic,
  which is exactly why this proposal reuses that pattern rather than inventing a new one (see
  architecture), but they check different things and neither replaces the other.
- **`packages/Scheduling/engine/src/ScheduledJobEngine.ts`** is the existing scheduled-job mechanism
  this proposal runs on — no second scheduler.
- **MJStorage**'s provider abstraction (already used by the Database Archiving Toolset plan for cold
  object storage) is the existing mechanism for locating a backup artifact wherever it lives (cloud
  blob, on-prem share) — no new storage integration.
- **`NotificationEngine`** is the existing mechanism for alerting an operator on failure — no second
  notification path.
- Distinct from **Data Health & Trust Layer** (2026-08-29): that engine scores whether *live* records
  are complete/current/consistent. This proposal never touches live data — it verifies a *copy* is
  recoverable at all, upstream of any question about that copy's content quality.
- Distinct from **Tenant Isolation Guarantee Layer** (2026-09-12): both follow the "auditor/self-test
  that turns a belief into a checked guarantee" pattern this log has used before, applied to a
  different failure mode (data partition vs. data recoverability) — deliberate consistency of
  approach, not overlap of subject.

## Proposed architecture

- **`MJ: Backup Verification Runs`** (new core entity) — one row per verification attempt: target
  environment/deployment, backup source identifier and its own timestamp, restore-target descriptor,
  `Outcome` (`Success`/`PartialFailure`/`Failure`), the individual integrity-check results (below),
  `Duration`, and a computed **RPO** (the gap between the backup's own timestamp and "now" — the real-
  world number that answers "how much would we lose if disaster struck this instant").
- **`BackupAssuranceEngine`** (new package `packages/BackupAssurance`, `Base` + `Engine` split, same
  layout convention as `packages/AI/Vectors/Dupe`) with a driver interface
  (`BaseBackupRestoreDriver`, `@RegisterClass`-registered per database platform — SQL Server
  `RESTORE DATABASE`, PostgreSQL `pg_restore`/`pg_basebackup`, matching the two platforms MJ already
  supports end-to-end) that:
  1. Locates the most recent backup artifact via the configured MJStorage provider.
  2. Provisions a disposable, network-isolated restore target — never reachable by production traffic,
     the same "restore a copy, never touch the original" discipline any responsible DR test requires.
  3. Executes the platform-appropriate restore.
  4. Runs an integrity-check suite: does the schema fingerprint match what's expected; does the
     Flyway/migration history table show the expected head migration applied; are row counts for a
     configurable set of core entity tables within tolerance of the source; do a sampled set of
     foreign-key relationships resolve correctly; optionally, run a handful of the repo's own
     deterministic integration-test queries against the restored copy as a "can it actually answer a
     real question correctly" smoke test, reusing the existing integration-test-suite rather than
     writing bespoke restore-specific assertions.
  5. Tears the restore target down (configurable short retention for forensics on failure).
  6. Writes the `Backup Verification Run` row and fires a `NotificationEngine` alert on any failure or
     on RPO exceeding a configured threshold.
- Triggered via `ScheduledJobEngine` (e.g., weekly, off-hours) or on demand via an Action.

### UI

A **Backup Assurance** admin dashboard (Angular, L2, `scaffold-mj-dashboard` pattern): a traffic-light
status per environment, an RPO/RTO trend chart across recent runs, a "run verification now" action,
and a drill-down into the most recent run's integrity-check breakdown — so "we're covered" becomes
something an operator can see evidence for, not something they hope is still true since the last time
someone checked manually. See mockup.

### Why this belongs in core, not an app

Every MJ deployment — a single-org install or a multi-tenant SaaS product built on MJ — needs the same
underlying guarantee: the backup protecting this data is provably restorable, on a known cadence, with
a known RPO. The storage location, schedule, and tolerance thresholds are deployment-specific
configuration; the mechanism (a disposable-restore-and-verify pipeline with a driver per database
platform) is universal infrastructure, the same category as the schema/migration tooling MJ already
ships as core.

## Phased rollout

1. **Phase 1** — `Backup Verification Runs` entity, `BackupAssuranceEngine` core, SQL Server driver,
   manual-trigger Action. Smallest useful slice: an operator can run one verification and get a real
   answer today.
2. **Phase 2** — Scheduled cadence via `ScheduledJobEngine`, `NotificationEngine` alerting, PostgreSQL
   driver parity.
3. **Phase 3** — Backup Assurance dashboard, integration-test-suite smoke-test hook for "does the
   restored copy answer real questions correctly," not just "does it have the right row counts."

## Open questions

- **Where does the disposable restore target run, and what does it cost?** Provisioning a full-size
  scratch database on every run has a real infrastructure cost for a small deployment. Leaning toward
  a configurable "restore a recent backup, verify, then immediately tear down" pattern with a schema-
  only or sampled-row-count-only "light" mode as a cheaper default, full smoke-test mode opt-in.
- **Credential and network isolation for the restore target.** The restore target must never be
  reachable by anything that could accidentally treat it as production — this needs an explicit
  design review before Phase 1 ships, not an afterthought.
- **Retention of failed-run artifacts for forensics** vs. the cost/risk of keeping a second full copy
  of sensitive data around longer than necessary — needs an explicit, short default retention window.

## Mockup

See [`mockups/backup-assurance-dashboard.html`](./mockups/backup-assurance-dashboard.html) — the
Backup Assurance dashboard showing per-environment status, the RPO/RTO trend, and a drill-down into a
verification run's integrity-check results. Screenshot:
[`screenshots/idea-2-backup-assurance-dashboard.png`](./screenshots/idea-2-backup-assurance-dashboard.png).

## Sources

- [Mindcore: 5 Backup and Disaster Recovery Gaps Nonprofits Miss](https://mind-core.com/blogs/5-backup-and-disaster-recovery-gaps-nonprofits-miss/) —
  the documented nonprofit ransomware case (untested restore found corrupt, $22,000 recovery cost,
  four days of downtime) and the "average organization hasn't verified a restore in 18+ months"
  finding.
- [Secureframe: The Disaster Recovery Gap — 110+ Statistics](https://secureframe.com/blog/disaster-recovery-statistics) —
  broader 2026 statistics on organizational disaster-recovery preparedness gaps.
- [Gitnux: 2026 Disaster Recovery Statistics](https://gitnux.org/disaster-recovery-statistics/) —
  the 62%-fail-to-test-backups and 50%-test-annually/7%-never-test figures.
- [Invenio IT: Disaster Recovery Statistics (2026)](https://invenioit.com/continuity/disaster-recovery-statistics/) —
  supporting figures on downtime cost and recovery-plan prevalence.
- MemberJunction repo issue **#2580** — read in full to confirm this proposal targets a distinct
  problem (operational restore verification of an existing deployment's own backups) from that
  issue's scope (legacy-system-backup-to-POC onboarding pathway).
