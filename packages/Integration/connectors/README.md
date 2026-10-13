# @memberjunction/integration-connectors

External Data Source connector **base classes** for the MemberJunction Integration Engine.

> **6.x: the concrete vendor connectors have moved out of this package.**
> Every connector that used to live here now ships from
> [MemberJunction/Integrations](https://github.com/MemberJunction/Integrations) as its own Open App.
> See [What moved, and where](#what-moved-and-where) below.

## What's still here

Three abstract base classes — the shared layer that the per-engine External Data Source connectors
extend. They are the entire public surface of this package.

| Export | Role |
|---|---|
| `BaseExternalDataSourceConnector` | The heart: bridges the Integration Engine's fetch/discovery contract onto the `@memberjunction/external-data-sources` connection layer. |
| `BaseSqlExternalDataSourceConnector` | SQL-flavoured specialisation. Extended by the SQL Server, PostgreSQL, MySQL, Oracle and Snowflake leaves. |
| `BaseDocumentDataSourceConnector` | Document-store specialisation. Extended by the MongoDB leaf. |

These stayed because six shipped Open Apps import them from this package rather than duplicating them:

```ts
// Platform/SQLServer/src/SQLServerConnector.ts  (in MemberJunction/Integrations)
import { BaseSqlExternalDataSourceConnector } from '@memberjunction/integration-connectors';
```

The leaves themselves are deliberately thin — each is little more than a `@RegisterClass` decorator, a
name, and a side-effect import of its engine driver. The logic lives here.

## Why the concrete connectors moved

They were **duplicated**. The same 36 connector classes existed in both repositories, and the Integrations
copy is the one that actually ships to customers: each connector there is a self-contained Open App with
its own `package.json`, versioning, changesets, seed migrations (SQL Server **and** PostgreSQL), metadata
and CI gates. Keeping a second copy in the monorepo meant every fix had to be applied twice, and the two
copies drifted.

Removing the monorepo copy makes the Integrations repo the single source of truth, and lets connectors
version and release independently of the MJ core release train.

## What moved, and where

Each row is a class removed from this package in 6.x, with the Open App that now owns it.

| Removed class | Open App | npm package |
|---|---|---|
| `AptifyConnector` | `AMS/Aptify` | `@memberjunction/connector-aptify` |
| `BlackbaudConnector` | `CRM/Blackbaud` | `@memberjunction/connector-blackbaud` |
| `ConstantContactConnector` | `Marketing/ConstantContact` | `@memberjunction/connector-constant-contact` |
| `CventConnector` | `Events/Cvent` | `@memberjunction/connector-cvent` |
| `DynamicsDataverseConnector` | `CRM/DynamicsDataverse` | `@memberjunction/connector-microsoft-dynamics-365-dataverse` |
| `FileFeedConnector` | `Platform/FileFeed` | `@memberjunction/connector-file-feed` |
| `FontevaConnector` | `AMS/Fonteva` | `@memberjunction/connector-fonteva` |
| `GrowthZoneConnector` | `AMS/GrowthZone` | `@memberjunction/connector-growthzone` |
| `HivebriteConnector` | `Platform/Hivebrite` | `@memberjunction/connector-hivebrite` |
| `HubSpotConnector` | `CRM/HubSpot` | `@memberjunction/connector-hubspot` |
| `IMISConnector` | `AMS/iMIS` | `@memberjunction/connector-imis` |
| `MJToMJConnector` | `Platform/MJtoMJ` | `@memberjunction/connector-mj-to-mj` |
| `MagnetMailConnector` | `Marketing/MagnetMail` | `@memberjunction/connector-magnetmail` |
| `MailchimpConnector` | `Marketing/Mailchimp` | `@memberjunction/connector-mailchimp` |
| `MemberSuiteConnector` | `AMS/MemberSuite` | `@memberjunction/connector-membersuite` |
| `NeonCRMConnector` | `CRM/NeonCRM` | `@memberjunction/connector-neon-crm` |
| `NetForumConnector` | `AMS/NetForum` | `@memberjunction/connector-netforum-enterprise` |
| `NetSuiteConnector` | `Finance/NetSuite` | `@memberjunction/connector-netsuite` |
| `NimbleAMSConnector` | `AMS/NimbleAMS` | `@memberjunction/connector-nimble-ams` |
| `NoviConnector` | `AMS/Novi` | `@memberjunction/connector-novi-ams` |
| `ORCIDConnector` | `Platform/ORCID` | `@memberjunction/connector-orcid` |
| `OpenWaterConnector` | `Events/OpenWater` | `@memberjunction/connector-openwater` |
| `PathLMSConnector` | `LMS/PathLMS` | `@memberjunction/connector-path-lms` |
| `PheedLoopConnector` | `Events/PheedLoop` | `@memberjunction/connector-pheedloop` |
| `PropFuelConnector` | `Marketing/PropFuel` | `@memberjunction/connector-propfuel` |
| `QuickBooksConnector` | `Finance/QuickBooks` | `@memberjunction/connector-quickbooks` |
| `RasaConnector` | `Marketing/Rasa` | `@memberjunction/connector-rasa-io` |
| `Reach360Connector` | `LMS/Reach360` | `@memberjunction/connector-reach360` |
| `RelationalDBConnector` | `Platform/RelationalDB` | `@memberjunction/connector-relational-db` |
| `RhythmConnector` | `AMS/Rhythm` | `@memberjunction/connector-rhythm-software` |
| `SageIntacctConnector` | `Finance/SageIntacct` | `@memberjunction/connector-sage-intacct` |
| `SalesforceConnector` | `CRM/Salesforce` | `@memberjunction/connector-salesforce` |
| `SharePointConnector` | `Platform/SharePoint` | `@memberjunction/connector-sharepoint` |
| `WicketConnector` | `AMS/Wicket` | `@memberjunction/connector-wicket` |
| `WildApricotConnector` | `AMS/WildApricot` | `@memberjunction/connector-wild-apricot` |
| `YourMembershipConnector` | `AMS/YourMembership` | `@memberjunction/connector-yourmembership` |

The Integrations repo also ships connectors that never existed here — Eventbrite, Impexium, Stripe,
Totara, Zendesk, Higher Logic (Thrive Community and Vanilla), Whova, and the per-engine EDS leaves
(SQL Server, PostgreSQL, MySQL, Oracle, Snowflake, MongoDB).

The `generate-integration-actions.ts` CLI was removed with them — it existed only to instantiate the
connectors in this package and emit their action metadata.

## Migrating a deployment

1. **Install the Open App(s)** you actually use. Each ships its own seed migration for SQL Server and
   PostgreSQL.
2. **The catalog row is re-pointed for you.** Each Open App's seed migration writes the *same*
   `__mj.Integration` row (same hardcoded `ID` as the monorepo's original seed) with `ClassName` and
   `ImportPath` set to the connector's npm package name. So an existing `CompanyIntegration` keeps
   working against the same Integration — its class resolution just moves from
   `@memberjunction/integration-connectors` to `@memberjunction/connector-<vendor>`.
3. **Update your imports** if you referenced a connector class directly in application code:
   ```diff
   - import { SalesforceConnector } from '@memberjunction/integration-connectors';
   + import { SalesforceConnector } from '@memberjunction/connector-salesforce';
   ```

> **Note on class-registration keys.** In this package the `@RegisterClass` key was the bare class symbol
> (`'SalesforceConnector'`). In the Integrations repo the key is the npm package name
> (`'@memberjunction/connector-salesforce'`), enforced by that repo's four-way identity invariant
> (registration key ≡ `Integration.ClassName` ≡ `ImportPath` ≡ package name). Step 2 above is what keeps
> resolution working: the Open App's own migration updates `ClassName` to match. **A deployment that
> upgrades MJ to 6.x without installing the corresponding Open App will have catalog rows pointing at a
> package that no longer contains those classes, and those integrations will fail to resolve.**

## Historical migrations are untouched

The `__mj.Integration` seeds under `migrations/v5/**` still carry the old `ClassName` / `ImportPath`
values. Applied migrations are immutable — they are not rewritten by this change. The re-point happens
forward, via each Open App's own migration, as described above.

## Building

```bash
cd packages/Integration/connectors
npm run build
```

## Testing

```bash
cd packages/Integration/connectors
npm run test          # single run
npm run test:watch    # watch mode
```

## Architecture

```
src/
  index.ts                                     # Package exports (the three base classes)
  datasource/
    BaseExternalDataSourceConnector.ts         # EDS-backed connector heart
    BaseSqlExternalDataSourceConnector.ts      # SQL specialisation
    BaseDocumentDataSourceConnector.ts         # Document-store specialisation
  __tests__/
    EdsConnectors.test.ts                      # Coverage for the three base classes
```
