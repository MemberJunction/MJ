# Idea 2: Cover & Handover — Time-Boxed Access, Delegation, and Clean Departures

**Week of 2026-10-10 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world

Small organizations are porous in a very human way. A volunteer treasurer helps through audit season
and never loses their access. The executive director takes a three-week leave and approvals pile up
(or a colleague shares a password). A coordinator leaves and nobody knows which records, scheduled
jobs, saved views and API keys were "theirs". The tax authority of at least one country now publishes
guidance titled *"Forgotten about access? Let's fix that"* for not-for-profits
([ATO](https://www.ato.gov.au/businesses-and-organisations/not-for-profit-organisations/not-for-profit-newsroom/forgotten-about-access-lets-fix-that)),
and practitioners describe nonprofit directors who could not say whether a former volunteer still has
donor-database access ([CentrexIT](https://centrexit.com/blog/volunteer-access-donor-database),
[NordVPN guide](https://nordvpn.com/blog/cybersecurity-for-nonprofits-onboarding-offboarding/) —
vendor sources, directional). Donor and member trust is the asset; stale access is its quietest threat.

The people best placed to fix it — a part-time office manager — have no time for a quarterly IAM audit.
The framework must make the *right* behaviour the *default* behaviour.

## What already exists (and what doesn't)

- **Roles and permissions are rich** (`MJRoleEntity`, `MJUserRoleEntity`, per-resource permission
  entities, `guides/UNIFIED_PERMISSIONS_GUIDE.md` with `NormalizedPermission.ExpiresAt?`). Several
  resource-sharing entities already carry `ExpiresAt` (e.g. share/API-key style records).
- **Gap, verified:** `MJUserRoleEntity` exposes only `ID, UserID, RoleID` — a *role assignment cannot
  expire*, and there is no delegation entity or access-review concept anywhere in
  `MJCoreEntities` or the prior exploration log (searched 2026-08-07…2026-10-03 for
  delegation / access review / offboarding: no hits beyond unrelated "expiry" of undo windows and
  suppressions).
- Many entities already have `OwnerUserID`, `UserID`, `CreatedByUserID`-style columns — enough to
  *find what a person owns* generically through metadata, no per-app code.
- Scheduling drivers, Notifications, and Communication exist for the reminders and escalations.

## Proposal — three small primitives that compose

### A. Time-boxed role assignment
Additive nullable `StartsAt` / `EndsAt` (+ `GrantedByUserID`, `Reason`) on `MJ: User Roles`. Role
resolution (`UserInfo` role load + the permission engine's cache) ignores assignments outside their
window; a sweeper job invalidates the cache at the boundary. "Give Priya Treasurer until 30 Nov" is
one dialog. Default for new *volunteer* role templates: 90-day window with a renewal prompt.

### B. Delegation ("cover while I'm away")
`MJ: Delegations`: FromUserID, ToUserID, `Scope` (Approvals queue / Tasks / Conversations / Agent
permission subset / explicit role list), StartsAt, EndsAt, Status, Note.
Hard rules:
1. **A delegate can never exceed the delegator** — effective rights are the *intersection*.
2. Delegated actions are stamped "Priya, on behalf of Marcus" in Record Changes / run audit — no
   password sharing, and the audit trail still tells the truth.
3. Auto-ends; the delegator gets a "welcome back — review what was done on your behalf" digest.
4. Never delegates *security administration* (granting roles, editing delegations) — blocked in the resolver.

### C. Access Reviews & Handover
1. **Review campaigns** (`MJ: Access Review Campaigns` + `…Items`): quarterly (schedulable), one item
   per *person×role* or *person×resource share*, each routed to the person's manager/resource owner:
   **Keep / Change / Remove / Extend to date**. Unanswered items follow a configurable policy
   (default for volunteers: *expire*; for staff: *escalate*). Output is a signed, exportable
   attestation — the artifact an auditor or board asks for.
2. **Handover Brief** when a user is deactivated or a window ends: a metadata-driven scan of "what
   this person owns" — records with an owner field, open tasks/approvals, scheduled jobs, saved views
   and dashboards others use, shared lists, API keys, agent runs in flight — with a one-click **reassign
   to…** per group and a "disable instead of delete" default. Items nobody claims go to a named
   fallback owner, never into the void.
3. **Dormant-access hints**: last-login based suggestions ("not seen in 120 days") feed the review —
   advisory only.

### Where it surfaces
Admin → *People & Access* page (Explorer L3) over a reusable Generic `ng-access-lifecycle` widget set;
a "Cover for me" entry in the user menu; reviewers get a focused inbox of decisions. All writes go
through `BaseEntity.Save()` so validation, Record Changes and existing events apply.

## Relationship to earlier weeks
- *Unified Resource Governance* (2026-08-14) is about who may use **resources**; this is about the
  **lifecycle of people's access** over time. It reuses (does not replace) its provider model.
- *Approval Gates* (2026-08-14) routes approvals; Delegation gives those queues a cover mechanism.
- Distinct from *Data Access Sentinel* (2026-09-05, anomaly detection): no detection, only hygiene.

## Phased rollout
1. **P1** — `StartsAt/EndsAt` on UserRole + enforcement + sweeper + dialog (smallest, highest value).
2. **P2** — Delegations with intersection + on-behalf-of audit stamping.
3. **P3** — Access-review campaigns + attestation export; Handover Brief with reassign.

## Success measures
% of volunteer/contractor roles with an end date; median days from departure to access removal;
approvals idle > 3 days while approver is flagged away; unowned records after a departure (target: 0).

## Risks / open questions
- Cache invalidation at window edges across multi-server deployments (use existing cache pub/sub guide).
- Intersection semantics with Field-Level Security and RLS — needs a proof in tests, not just design.
- Legal/HR sensitivity: reviews surface *roles*, not performance; keep wording neutral.

## Mockup
[`mockups/idea-2-cover-handover.html`](./mockups/idea-2-cover-handover.html) — People & Access with
expiring roles, an active delegation, an open review campaign, and a Handover Brief with reassignment.
