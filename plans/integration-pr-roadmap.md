# Integration Expansion — PR Roadmap

Companion to [integration-framework-redesign.md](integration-framework-redesign.md)
(code design) and the agent-architecture memory. This doc is the **sequence of PRs**.
Goal: raise 1-2 PRs/day with **zero hiccups** — which only works if the agent
architecture (provable-only, gated, self-verifying) is solid first.

Vision source: `Downloads/compass_artifact_...md` — 152 evidence-backed connectors
for the association/nonprofit market. Priority sequence from that doc:
(1) Top-5 AMS → (2) Higher Logic/Cadmium/Cvent/Crowd Wisdom → (3) Stripe/AffiniPay/
Sage Intacct/QuickBooks → (4) general SaaS (Mailchimp/Slack/DocuSign).

---

## Current state (after PR #2623 merged into next, 5.35)
**25 connectors built:** Aptify, Betty, Blackbaud, ConstantContact, FileFeed,
GrowthZone, HubSpot, IMIS, MJToMJ, MagnetMail, Mailchimp, NetForum, NetSuite,
NimbleAMS, PropFuel, QuickBooks, Rasa, Reach360, RelationalDB, SageIntacct,
Salesforce, SharePoint, Wicket, WildApricot, YourMembership.

**Tested extensively:** HubSpot, Salesforce ONLY. The other ~23 are built but NOT
load/credential-tested → they form the "expand + test" backlog.

---

## PR 1 — Framework Extension (the big one)
Implements [integration-framework-redesign.md](integration-framework-redesign.md):
B1 (metadata-driven writes in REST base + dead-column fix), B2 (`MetadataSource`
enum), B3a (interface↔entity bug — `IsPrimaryKey`), C1 (protocol bases incl. file),
C3 (pre-seed before discover), C4 (FK-graph traversal), D (generic CRUD action as
canonical + selective strong-typed, retire bulk gen + plan BizApps dedup), E
(`EnrichSchemaConstraints` lightweight pass), F (runtime per-connector seeding), G
(retire connector-validator), H (structured progress artifacts for RSU + syncs).
**Gate:** the agent architecture's deterministic verifier + e2e ladder must exist
here too — PR 1 is also where the build-pipeline discipline lands. No new connectors
in PR 1; it re-tools the framework all ~25 existing connectors will be migrated onto.

> Open decisions to lock before PR 1 (redesign §I): write-column migrate-vs-alias,
> `MetadataSource` shim-vs-cutover, `EnrichSchemaConstraints` location, runtime
> sync-push trigger mechanism.

---

## Ordering principle — interleaved, depth-first (NOT by section)
New connectors are sequenced by **weighted round-robin across fields**, not in
category blocks. Each "round" takes the highest-value remaining connector from each
field in this within-round priority: AMS → Community → Events → LMS → Payments →
CRM/Donor → Accounting → Marketing → Docs/Storage → Advocacy → Survey → Productivity
→ SMS → BI → Career. Result: by ~PR 16 every field has its flagship connector, and
each field deepens gradually in parallel — depth-first within field, breadth across
fields. Smaller fields empty first and drop out of later rounds; AMS/CRM/Events/LMS
(largest backlogs) continue to the tail.

## Phase A — paired PRs: expand one existing (untested) + add one new
Each PR does BOTH: (1) re-research/expand+test an existing untested connector (WITH
creds if available, else format-only via curl+sandbox; agent never reads creds; mark
`sync-verified` vs `format-verified-no-creds`), and (2) build+test one new connector.
23 PRs exhaust the existing-untested backlog (HubSpot & Salesforce already tested).
The "add" column follows the interleaved order (round 1 = flagship of each field).

| PR | Title |
|----|-------|
| PR 2  | `feat(int): expand+test iMIS · add Fonteva (AMS)` |
| PR 3  | `feat(int): expand+test NimbleAMS · add Higher Logic Thrive (Community)` |
| PR 4  | `feat(int): expand+test YourMembership · add Cvent (Events)` |
| PR 5  | `feat(int): expand+test NetForum · add Crowd Wisdom (LMS)` |
| PR 6  | `feat(int): expand+test Aptify · add Stripe (Payments)` |
| PR 7  | `feat(int): expand+test Wicket · add Blackbaud Raiser's Edge NXT (CRM/Donor)` |
| PR 8  | `feat(int): expand+test GrowthZone · add Xero (Accounting)` |
| PR 9  | `feat(int): expand+test WildApricot · add Marketo (Marketing)` |
| PR 10 | `feat(int): expand+test Blackbaud · add DocuSign (Docs/E-Sign)` |
| PR 11 | `feat(int): expand+test SageIntacct · add Quorum (Advocacy)` |
| PR 12 | `feat(int): expand+test NetSuite · add SurveyMonkey (Survey)` |
| PR 13 | `feat(int): expand+test QuickBooks · add Microsoft Teams (Productivity)` |
| PR 14 | `feat(int): expand+test Mailchimp · add Mogli SMS (SMS)` |
| PR 15 | `feat(int): expand+test ConstantContact · add Power BI (BI)` |
| PR 16 | `feat(int): expand+test MagnetMail · add YM Careers (Career)` |
| PR 17 | `feat(int): expand+test PropFuel · add MemberClicks (AMS)` |
| PR 18 | `feat(int): expand+test Reach360 · add Higher Logic Informz (Community)` |
| PR 19 | `feat(int): expand+test Betty · add Cadmium Eventscribe (Events)` |
| PR 20 | `feat(int): expand+test Rasa · add Docebo (LMS)` |
| PR 21 | `feat(int): expand+test SharePoint · add AffiniPay (Payments)` |
| PR 22 | `feat(int): expand+test MJToMJ · add Salesforce Nonprofit Cloud (CRM/Donor)` |
| PR 23 | `feat(int): expand+test FileFeed (read from MJStorage) · add Dynamics 365 Business Central (Accounting)` |
| PR 24 | `feat(int): expand+test RelationalDB · add Pardot / SF MC Account Engagement (Marketing)` |

## Phase B — new connector per PR (backlog exhausted, tested thoroughly)
Continues the same interleaved order. Each `feat(int): add <connector> (<category>)`.

| PR | Add (category) | | PR | Add (category) |
|----|----|----|----|----|
| 25 | → file-storage track (see below) | | 74 | Clowder (Community) |
| 26 | VoterVoice (Advocacy) | | 75 | Eventbrite (Events) |
| 27 | Qualtrics (Survey) | | 76 | Freestone (LMS) |
| 28 | Slack (Productivity) | | 77 | Braintree (Payments) |
| 29 | EZ Texting (SMS) | | 78 | DonorPerfect (CRM/Donor) |
| 30 | Snowflake (BI) | | 79 | Acumatica (Accounting) |
| 31 | Naylor (Career) | | 80 | Campaign Monitor (Marketing) |
| 32 | Personify 360 (AMS) | | 81 | FormAssembly (Docs) |
| 33 | Hivebrite (Community) | | 82 | Engaging Networks (Advocacy) |
| 34 | Zoom (Events) | | 83 | Power Automate (BI) |
| 35 | BlueSky / Path LMS (LMS) | | 84 | MemberSuite (AMS) |
| 36 | Authorize.net (Payments) | | 85 | Sengii (Community) |
| 37 | Salesforce NPSP (CRM/Donor) | | 86 | OpenWater (Events) |
| 38 | Blackbaud Financial Edge NXT (Accounting) | | 87 | Web Courseworks (LMS) |
| 39 | Salesforce Marketing Cloud (Marketing) | | 88 | Global Payments (Payments) |
| 40 | → file-storage track (see below) | | 89 | Virtuous (CRM/Donor) |
| 41 | FiscalNote (Advocacy) | | 90 | QuickBooks Desktop (Accounting) |
| 42 | Typeform — real connector, retire BizApps stub (Survey) | | 91 | Eloqua (Marketing) |
| 43 | Calendly (Productivity) | | 92 | Formstack (Docs) |
| 44 | TextMagic (SMS) | | 93 | New/Mode (Advocacy) |
| 45 | Zapier (iPaaS) | | 94 | Novi AMS (AMS) |
| 46 | Web Scribble (Career) | | 95 | Mighty Networks (Community) |
| 47 | re:Members / Impexium (AMS) | | 96 | GoToWebinar (Events) |
| 48 | Forj (Community) | | 97 | LearnUpon (LMS) |
| 49 | A2Z Events (Events) | | 98 | Worldpay / FIS (Payments) |
| 50 | Cadmium Elevate (LMS) | | 99 | Blackbaud CRM Enterprise (CRM/Donor) |
| 51 | PayPal (Payments) | | 100 | Adestra (Marketing) |
| 52 | Bloomerang (CRM/Donor) | | 101 | ClearVantage (AMS) |
| 53 | Avalara AvaTax (Accounting) | | 102 | Whova (Events) |
| 54 | Klaviyo (Marketing) | | 103 | OASIS LMS (LMS) |
| 55 | → file-storage track (see below) | | 104 | Adyen (Payments) |
| 56 | Quorum Grassroots (Advocacy) | | 105 | Donorbox (CRM/Donor) |
| 57 | Jotform (Survey) | | 106 | Benchmark Email (Marketing) |
| 58 | Google Workspace (Productivity) | | 107 | Cobalt AMS (AMS) |
| 59 | Tableau (BI) | | 108 | Map Dynamics (Events) |
| 60 | JobTarget (Career) | | 109 | Cadmium EthosCE (LMS) |
| 61 | Rhythm (AMS) | | 110 | iATS Payments (Payments) |
| 62 | Breezio (Community) | | 111 | Bonterra Network for Good (CRM/Donor) |
| 63 | ON24 (Events) | | 112 | ClickDimensions (Marketing) |
| 64 | TopClass / WBT (LMS) | | 113 | Altai Systems (AMS) |
| 65 | Square (Payments) | | 114 | Map D / Event Home Base (Events) |
| 66 | Bonterra EveryAction (CRM/Donor) | | 115 | D2L Brightspace (LMS) |
| 67 | MIP Fund Accounting (Accounting) | | 116 | Little Green Light (CRM/Donor) |
| 68 | ActiveCampaign (Marketing) | | 117 | Protech UX365 (AMS) |
| 69 | Adobe Sign (Docs) | | 118 | Fielddrive (Events) |
| 70 | Muster (Advocacy) | | 119 | Bonterra Salsa (CRM/Donor) |
| 71 | Google Forms (Survey) | | 120 | NeonCRM (AMS) |
| 72 | Databricks (BI) | | 121 | Bonterra CyberGrants (CRM/Donor) |
| 73 | ACGI Association Anywhere (AMS) | | | |

## File-storage track — NOT new connectors (MJStorage composition)
These are **already MJStorage drivers** (AWS, Azure, Box, Dropbox, GoogleDrive,
SharePoint, GCS all exist). Do NOT build them as from-scratch integration connectors
— that repeats the SharePoint duplication (SharePoint is currently both a connector
*and* a storage driver). Instead, a separate track wires them into the integration
layer via `BaseFileIntegrationConnector` (redesign C1): sync file **metadata as rows**
through the integration framework, **delegate the bytes to the existing MJStorage
driver**, optionally hand content to the Entity-Document/vector pipeline. One shared
connection per provider, no duplicate byte-transfer code.

- FS-1 `BaseFileIntegrationConnector` base + collapse SharePoint's connector/driver duplication (proof case)
- FS-2 Google Drive (compose onto GoogleDriveFileStorage)
- FS-3 OneDrive / M365 Files
- FS-4 Box (compose onto BoxFileStorage)
- FS-5 Dropbox (compose onto DropboxFileStorage)
- Pure-infra storage (AWS S3, Azure Blob, GCS) stay MJStorage-only — MJ's own backing
  store, never integration connectors.

**Coverage:** PR 2-24 expand all 23 untested existing + add 23 new; PR 25-121 add the
remaining net-new (file-storage providers removed → FS track). ~117 net-new connectors
+ 5-item FS composition track, interleaved depth-first across the genuine-integration
fields. Out of scope as "new" (already real in MJ): HubSpot,
Salesforce, SageIntacct, NetSuite, QuickBooks(QBO), Mailchimp, ConstantContact,
MagnetMail(=Real Magnet), Blackbaud(=RE NXT base), Rasa(=rasa.io), Wicket, the 8 AMS
already built, plus comm/AI providers already shipped (Twilio, Gmail, MS Graph,
Outlook, 23 AI packages, 5 vector DBs).

## Standing rule — credential arrivals reprioritize
If a real/sandbox credential arrives for any connector that was only
`format-verified-no-creds`, **insert a PR to fully sync-verify it** ahead of new
adds. Re-test elevates it to `sync-verified`. Can preempt Phase A/B at any time.

## Standing rule — credential arrivals reprioritize
If a real/sandbox credential arrives for any connector that was only
`format-verified-no-creds`, **insert a PR to fully sync-verify it** ahead of new adds.
Re-test elevates it to `sync-verified`. This rule can preempt Phase A/B at any time.

---

## What makes "zero hiccups" real (not a wish)
Every PR rides the same agent-architecture guarantees (see agent memory):
provable-only metadata (verifier re-runs extraction scripts), computed
source-completeness diff, e2e verification ladder (T0 structural → T4 sync; e2e is
confirmation not discovery), batch-fix-then-rerun, never-merge automation (agent
raises PR, human merges). Consistency is a property of the gates, not of luck.

## Productization (parallel track)
Multi-tenant SaaS → user requests connector → Azure service bus → docker env w/
Claude Code `-p` → raises PR (NEVER merges). Target: hundreds of connectors in ~30
days. Each such PR follows the Phase A/B shape above.
