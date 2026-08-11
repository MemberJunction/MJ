# Upgrading to v6

MemberJunction 6.x is live on the **Edge channel**. This guide covers everything a 5.x
deployment or codebase needs to know to move to the 6.x line — current as of
`6.1.0-edge.0`, and maintained as the Edge stream advances.

The short version: **6.x opened a new release era, not a platform rewrite.** The core API
surface — `RunView`, `BaseEntity`, the provider interfaces, `@memberjunction/core`'s entire
export list — is byte-for-byte identical to 5.51.0, and Angular, Node, TypeScript, zod, and
rxjs floors did not move. There is a short list of real breaking changes, documented below;
most upgrades will only feel one or two of them.

## Understanding the 6.x version scheme

Five facts up front, because the numbering is the part most likely to confuse a 5.x user:

- **There is no 6.0.0.** It was a never-published internal baseline; npm goes straight from
  `5.51.0` to `6.1.0-edge.0`. Don't go looking for it.
- **`latest` still points at the certified 5.x line** (5.51.0 today). It moves only when a
  line is certified — never for an Edge release.
- **Edge builds publish under the `edge` dist-tag**: `npm install @memberjunction/core@edge`.
- **Ordinary semver ranges never auto-resolve an Edge build.** `^5.51.0` — and even `^6.0.0` —
  will not pull `6.1.0-edge.N`, because npm excludes prereleases from range matching. Your
  existing installation cannot drift onto 6.x by accident; upgrading is always an explicit
  opt-in.
- **Docker `:latest` tracks certified builds only.** Edge releases publish no image.

## Before you upgrade — checklist

Work through these *before* installing 6.x. Each links to its detail section below.

1. Do you import vendor connector classes from `@memberjunction/integration-connectors`, or
   have `CompanyIntegration` rows for those vendors? → [Connectors](#the-vendor-connectors-moved-to-open-apps)
2. Does anything read `ActionExecutionLog.Params` to see an action's **outputs**? →
   [ActionExecutionLog](#actionexecutionlogparams-now-holds-inputs-only)
3. Do you call `AIEngine.FindSimilarAgents` / `FindSimilarActions` or the agent/action
   embedding services directly from TypeScript? → [AIEngine](#aiengine-similarity-apis-were-replaced)
4. Do any stored MJ Queries, view filters, or user expressions reference
   `INFORMATION_SCHEMA`, `sys.*`, or `pg_catalog`? → [System catalogs](#system-catalog-references-are-now-rejected)
5. Does your identity provider sign tokens with **HS256** (a shared secret) rather than
   RS256/ES256? → [JWT algorithms](#jwt-signature-algorithms-are-now-pinned)
6. Do you use negation-form (`<>`, `NOT IN`, `NOT LIKE`) row-level-security filters? →
   [RLS filters](#negation-form-rls-filters-now-match-fewer-rows)

If all six answers are "no," your upgrade is: install the `@edge` versions, run the
database migrations, run `mj sync push` then `mj codegen`, restart MJAPI. Done.

## Breaking changes

### The vendor connectors moved to Open Apps

**The single biggest change in 6.x.** `@memberjunction/integration-connectors` was emptied
down to its three shared base classes (`BaseExternalDataSourceConnector`,
`BaseSqlExternalDataSourceConnector`, `BaseDocumentDataSourceConnector`). The 36 vendor
connectors — Salesforce, HubSpot, Mailchimp, QuickBooks, Blackbaud, NetSuite, iMIS, and the
rest — now ship from the [MemberJunction/Integrations](https://github.com/MemberJunction/Integrations)
repository as **one Open App per connector**, versioned independently of the MJ release train.

Note the package itself was *not* removed or unpublished — it still exists at `6.1.0-edge.0`
with the base classes six shipped Open Apps depend on. What's gone is the vendor connector
classes inside it.

**Who feels it, two ways:**

- *Build time:* any direct `import { SalesforceConnector } from
  '@memberjunction/integration-connectors'` is now a compile error.
- *Runtime — the quieter one:* existing `CompanyIntegration` rows for these vendors still
  point at a package that no longer contains the class. Nothing fails at build time; the
  integration fails to resolve when it runs.

**Migration:**

1. Install the Open App for each connector you use (`@memberjunction/connector-<vendor>`).
2. Re-point direct imports at the connector's own package.
3. Registration keys changed from the bare class symbol to the npm package name — see
   `packages/Integration/docs/connector-development.md`.
4. Each Open App's seed migration rewrites the *same* `__mj.Integration` row (same ID) with
   the new `ClassName`/`ImportPath`, so existing `CompanyIntegration` records keep working.

> **⚠️ Known gap — seven integrations do not cleanly re-point yet.** The same-ID re-point
> covers 16 of the 24 monorepo-seeded integrations. For **Mailchimp, Blackbaud, HubSpot,
> MagnetMail, and Wild Apricot**, the Open App seeds a *different* row ID with a colliding
> name, so installing the connector fails on the `Integration` name unique constraint until
> the pre-existing row is renamed or removed. For **Constant Contact** the install succeeds
> but leaves the original row dangling alongside a new one, and **File Feed** has no Open App
> seed migration at all. If you use any of these seven, plan manual row cleanup as part of
> the upgrade — this is a known, not-yet-resolved gap upstream, not something you're doing
> wrong.

### `ActionExecutionLog.Params` now holds inputs only

The column was **repurposed**: it previously held the final merged parameter set (inputs plus
whatever outputs the action appended); it now holds the **as-called inputs**, captured at the
top of `RunAction` so all exit paths record the same values. The merged set moved to the new
`ResultParams` column, which is written on failure exactly as on success — `NULL` now means
precisely "the run never finished."

This is the one 6.x change most likely to produce **wrong numbers rather than an error**:
any dashboard, report, or saved Query reading `Params` for an action's *outputs* will
silently get inputs instead.

**Migration:** re-point output-readers at `ResultParams`. Input-readers need no change and
are now more accurate than before.

### AIEngine similarity APIs were replaced

`AIEngine.FindSimilarAgents`, `FindSimilarActions`, `RefreshAgentEmbeddings`,
`RefreshActionEmbeddings`, and the `AgentVectorService`/`ActionVectorService` getters were
removed, along with the `AgentEmbeddingService`/`ActionEmbeddingService` modules. Direct
TypeScript callers get a compile error.

**Migration:** use the unified search pipeline —

```ts
Provider.SearchEntity({ entityName: 'MJ: AI Agents' /* or 'MJ: Actions' */, ... })
```

**Metadata-driven callers need no change**: the five core actions built on the old paths
("Find Best Action", "Find Candidate Actions", "Find Best Agent", "Find Candidate Agents",
"Search Query Catalog") were rewritten as backward-compatible wrappers with identical
parameters and output shapes. Query embeddings are now populated automatically by the daily
Entity Vector Sync job.

### System catalog references are now rejected

The SQL expression validator now blocks references to database system catalogs in **all**
user-supplied SQL contexts — stored MJ Queries, view filters, ad-hoc expressions:

- SQL Server: `sys.*`, `INFORMATION_SCHEMA`, `syslogins`
- PostgreSQL: `pg_catalog.*`, `pg_authid` / `pg_shadow` / `pg_user` / `pg_roles`

Queries that previously validated and ran — schema-explorer helpers, "list all columns"
admin tooling — now fail validation with *"Access to database system catalogs / metadata
objects is not allowed."* String literals are stripped before the check, so a literal value
containing `sys.` is safe; only real object references trip it.

**Migration:** audit stored Queries for catalog references before upgrading, and replace
catalog introspection with MJ's own metadata (`Metadata.Entities`, `EntityInfo.Fields`),
which respects the entity-permission model. There is deliberately no opt-out: these objects
sit outside MJ's permission model.

### JWT signature algorithms are now pinned

Token verification (MJServer and the MCP server) now accepts only asymmetric algorithms:
`RS256, RS384, RS512, ES256, ES384, ES512, PS256`. Previously every algorithm the JWT
library understood was accepted, including symmetric HMAC.

**Who feels it:** only deployments whose identity provider issues **HS256** (shared-secret)
tokens — those now fail closed. Standard OIDC providers (Auth0, Microsoft Entra, Okta) sign
RS256 and are unaffected.

**Migration:** decode a live token and check its `alg` header before upgrading. If it's
`HS256`, reconfigure the issuer to an asymmetric algorithm. The list is hardcoded by design
(it forecloses `alg=none` and RS256→HS256 confusion attacks); there is no configuration
escape hatch.

### Negation-form RLS filters now match fewer rows

Row-level-security filter substitution had two permissive bugs: `undefined` user properties
substituted as the literal string `"undefined"`, and embedded quotes weren't escaped. Both
are fixed. Equality-style filters are unaffected, but filters written in negation form
(`<>`, `NOT IN`, `NOT LIKE`) against a sometimes-undefined user property previously matched
*more* rows than intended — and now correctly match fewer.

**Migration:** none required — but tell your users. "I see fewer rows after the upgrade" is
the fix working, not a regression. Audit negation-form filters in advance if you need to
know the blast radius.

### Minor: ElevenLabs realtime session initiation

`ElevenLabsRealtimeSession.SendInitiation` now takes the wire-shaped overrides object rather
than a system-prompt string, and `PromptOverrideEnabled` is deprecated in favor of
`OverridesSatisfied`. The class is driver-constructed and essentially never instantiated by
consumers — listed for completeness.

## For contributors — building MJ from source

### The monorepo is on pnpm

As of 6.x, the MJ repo is a **pnpm workspace** (`packageManager` pins pnpm; the lockfile is
`pnpm-lock.yaml`; there is no `package-lock.json`). **Never run `npm install` in the repo** —
it would write a lockfile the repo no longer uses and resolve a materially different tree.

```bash
corepack enable        # or: npm i -g pnpm
pnpm install           # at the repository ROOT, never inside a package
pnpm run build
```

Declare every import: pnpm's strict linking gives a package only what its `package.json`
declares — no more silently borrowing a hoisted copy. (The cutover itself surfaced and fixed
fifteen packages' worth of exactly that bug class.)

**Consumers are unaffected** — published package contents and npm/yarn installs of MJ
packages are identical. This is purely a build-time change for source checkouts.

### CI gates got stricter

PRs that passed at 5.51.0 can fail now: spec files are type-checked before running
(`test:types`), DOM-spec placement and anti-patterns are linted, Explorer DOM coverage has a
floor, and **every SQL Server migration change requires its PostgreSQL counterpart** — both
existence and content are CI-enforced. The adopted-standards checks now ship as
`@memberjunction/standards` with `mj standards adopt|check|list`.

## Database migrations

Seven migrations, each with a PostgreSQL counterpart. **None are destructive** — the changes
are additive columns, nullable FKs, a widened CHECK constraint, view/procedure regeneration,
and metadata syncs.

Run order matters:

```bash
npx mj migrate --verbose     # apply the 6.x migrations
npx mj sync push             # push metadata BEFORE codegen (standing rule)
npx mj codegen               # regenerate — required after the EntityAction migration
# then restart MJAPI — its boot-time caches don't re-read live
```

## Behavior changes worth knowing (no action required)

- **The metadata cache now actually refreshes every 3 minutes.** A units bug had the
  refresh interval at roughly 50 hours — if you've been restarting MJAPI to pick up metadata
  changes, that ritual is now unnecessary.
- **Push-subscription hijack fixed:** `statusUpdates` subscriptions previously filtered only
  on a client-supplied session id without checking it against the authenticated subscriber;
  they now fail closed. No operator action needed.
- Additive features you can ignore until you want them: layered base views (SQL Server only,
  opt-in per entity), per-verb direct-SQL flags (default off), API-key row-filter columns
  (enforcement lands later), a pluggable search-scope permission resolver, and mobile
  records UX below 768px.

## What did NOT change

Verified by diffing the `v5.51.0` and `v6.1.0-edge.0` tags directly:

| Concern | Status |
|---|---|
| `@memberjunction/core` export surface | **Byte-identical** |
| `RunView` / `RunViews` / `BaseEntity` / provider interfaces | **Byte-identical** |
| Angular | 21.1.3 at both tags |
| Node floor | `>=20.0.0`, unchanged |
| TypeScript / zod / rxjs | unchanged (`5.9.x` / `^3.25.0` / `^7.8.2`) |
| Published package inventory | none removed (one added: `@memberjunction/standards`) |
| `mj.config.cjs` / `install.config.json` shape | no diff |
| Entity naming (`MJ: ` prefix) | unchanged |

If a concern of yours isn't listed anywhere in this document, it most likely didn't change —
the 6.x era open was a release-process milestone (Edge/LTS channels, the era model) far more
than a platform break.
