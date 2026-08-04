---
"@memberjunction/integration-connectors": major
"@memberjunction/server-bootstrap": major
---

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
`BaseDocumentDataSourceConnector`. These are *not* duplicated: six shipped Open Apps (SQL Server,
PostgreSQL, MySQL, Oracle, Snowflake, MongoDB) import them from this package rather than carrying their
own copy, so the package stays — reduced to that shared layer.

**Migration.** Install the Open App for each connector you use. Its seed migration writes the *same*
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

| Integration | monorepo seed | Open App seed | what happens on install |
|---|---|---|---|
| Mailchimp | `987FA1B5-…` `Mailchimp` | `D9C7F5B4-…` `mailchimp` | **install fails** — `UQ_Integration_Name` violation |
| Blackbaud | `2BBF275A-…` `Blackbaud` | `0159550E-…` `blackbaud` | **install fails** — same, collation is `CI` |
| HubSpot | `3DD4C246-…` `HubSpot` | `71EC4CCB-…` `HubSpot` | **install fails** — same |
| MagnetMail | `7F9BD70C-…` `MagnetMail` | `98A49146-…` `magnetmail` | **install fails** — same |
| Wild Apricot | `4FB2B6BF-…` `Wild Apricot` | `FE1334F6-…` `Wild Apricot` | **install fails** — same |
| Constant Contact | `16B66076-…` `Constant Contact` | `65BB124A-…` `constant-contact` | installs a **second** row; the original silently dangles |
| File Feed | `D26F22CE-…` `File Feed` | *(no seed migration at all)* | nothing re-points it; the row dangles |

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
