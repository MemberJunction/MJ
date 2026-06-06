# [New AMS Integration] Fonteva + Salesforce enhancement — Plan

**Branch:** `connectors/fonteva_salesforce`
**Worktree:** `/Users/madhavsubramaniyam/Projects/MJ/MJ-fonteva`
**Status:** Draft plan (pre-PR). No PR raised yet.

## 1. Context

Fonteva is an Association Management System (AMS) built **as a managed package on the Salesforce
platform**. Its records are not a separate API surface — they are namespace-prefixed **custom sObjects**
(e.g. `OrderApi__*`, event/membership module prefixes) served through the *same* Salesforce REST API the
existing connector already speaks.

The repo already ships a mature `SalesforceConnector`
(`packages/Integration/connectors/src/SalesforceConnector.ts`, `IntegrationName: 'Salesforce'`,
extends `BaseRESTIntegrationConnector`):
- **Live discovery** — `DiscoverObjects` via `describeGlobal` (`/sobjects/`), `DiscoverFields` via
  `/sobjects/{name}/describe`. Fully dynamic; captures customs by design.
- **Full CRUD + incremental** — `CreateRecord`/`UpdateRecord`/`DeleteRecord`, `FetchChanges` watermarked
  on `SystemModstamp`/`LastModifiedDate`.
- **API-family routing** — `sobject` (default) and `tooling`.
- **A discovery filter** that drops most of the ~1,866 standard-org sObjects as system/audit noise
  (bypass env: `MJ_SALESFORCE_INCLUDE_ALL_SOBJECTS=true`).

**Consequence:** Fonteva integration is mostly a *configuration + targeted enhancement* of the Salesforce
connector, **not** a from-scratch connector. The risk is that Fonteva's managed-package objects get caught
by the system/audit filter, or that cross-object relationships within the Fonteva data model aren't
surfaced cleanly.

## 2. Decision to confirm (open) — connector shape

Two viable shapes; pick one before coding:

- **Option A — Fonteva as a thin subclass / registered Integration over the SF connector.**
  New `IntegrationName: 'Fonteva'`, reusing SF auth + transport, overriding `DiscoverObjects` to *prefer*
  Fonteva-namespace objects (and their related standard objects: Account, Contact, etc.). Gives Fonteva its
  own Integration row, icon, and curated object set without forking transport logic.
- **Option B — No new connector; configure the existing Salesforce connector** against a Fonteva org and
  rely on discovery + per-tenant `ExcludedIOs` / include-all to surface the managed-package objects.

**Recommendation: Option A** — a Fonteva-branded Integration that delegates to the SF transport but curates
the object set, so customers see "Fonteva" with the right tables, and the SF connector stays generic.
*(Confirm with stakeholder — this is the load-bearing decision for the whole PR.)*

## 3. Scope of the Salesforce enhancement

Whatever Option A needs from the base SF connector, kept generic (benefits all SF customers):

1. **Namespace-aware discovery** — make the system/audit filter namespace-prefix-aware so managed-package
   customs (Fonteva and any other) are never silently dropped; expose the namespace as discovered metadata.
2. **Managed-package object grouping** — surface the package namespace so the Fonteva layer can select
   "all `<fonteva-namespace>` objects + their referenced standard objects" without an env override.
3. **Relationship fidelity** — verify FK (`IsForeignKey` + `ForeignKeyTarget`) emission across Fonteva
   junction/child objects so the DAG/traversal order is correct for sync.
4. **(If gaps found)** bounded-typing / `MaxLength` pass for Fonteva long-text fields, per the
   sync-efficiency contract.

> Provable-only discipline (repo rule): do **not** hardcode a fabricated Fonteva object/namespace list.
> Confirm the actual namespace prefixes + object inventory from `describeGlobal` against a real Fonteva
> org and/or Fonteva developer docs before curating.

## 4. Object coverage approach (provable, not invented)

- Run `describeGlobal` against a Fonteva org (or read Fonteva's published data-dictionary) to enumerate the
  real namespace prefixes and core objects (membership, orders/commerce, events, etc.).
- Curate the Fonteva Integration's object set from that real inventory + the standard objects Fonteva links
  to (Account/Contact/Campaign).
- Field-level discovery stays fully live (`/describe`) — no static field catalog.

## 5. Testing approach (credential triage first)

Per `.claude/rules/connector-credential-testing.md`, classify credential obtainability up front and report
the achievable ceiling:
- **Live (PATH 1)** — if a Fonteva/Salesforce dev/sandbox org is broker-held or self-serve, run the
  ordered §1→§7 live E2E on SQL Server (PG suspended for the per-connector loop).
- **Credential-free (PATH 2)** — otherwise: mock the SF REST surface from the documented sObject describe
  shapes, replay fixtures, status-probe the endpoints, and prove the discovery→map→CRUD→incremental path
  against a spec-driven mock. Label the ceiling `format-verified-no-creds` honestly.
- Mocked vitest tiers (T4/T5) for the Fonteva object curation + namespace-filter logic regardless.

## 6. Deliverables for the PR

- [ ] Connector-shape decision recorded (§2)
- [ ] Salesforce connector enhancement (§3) — generic, with tests
- [ ] Fonteva Integration metadata + curated object set (§4), provenance/code-evidence backed
- [ ] Tests at the achieved tier (§5) + honest residual-gap statement
- [ ] Changeset

## 7. Open questions

1. **Connector shape** — Option A (Fonteva-branded Integration) vs B (configure SF). (Recommend A.)
2. **Credential** — is a Fonteva or SF sandbox org reachable to us (broker / self-serve), setting the
   test ceiling?
3. **"Salesforce enhancement"** — is there a *specific* known SF-connector gap this PR must close, or is the
   scope "whatever Fonteva surfacing requires"?
4. **Object scope** — full Fonteva managed-package surface, or a prioritized subset (membership + orders +
   events) for v1?

## Links

- Salesforce connector: `packages/Integration/connectors/src/SalesforceConnector.ts`
- Connector code conventions: `.claude/rules/connector-code-conventions.md`
- Credential/testing conventions: `.claude/rules/connector-credential-testing.md`
- Metadata file conventions: `.claude/rules/metadata-file-conventions.md`
