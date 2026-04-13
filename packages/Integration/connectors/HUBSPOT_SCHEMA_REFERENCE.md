# HubSpot Schema Reference — Definitive Data Tables

> **Source**: Reconciled against `GET https://api.hubspot.com/public/api/spec/v1/specs` — 100 official APIs.
> **Verified**: April 12, 2026

## Schema Tiers

| Tier | Count | Custom Columns? | Discovery Method |
|------|-------|-----------------|------------------|
| T1: CRM Objects | 38 | Yes | `GET /crm/v3/properties/{objectType}` |
| T2: Custom Objects | Unlimited | Yes (entirely user-defined) | `GET /crm/v3/schemas` |
| T3: Static Schema | 38 | No | Hardcoded from API spec |
| HubDB | Unlimited | Yes (user-defined columns) | `GET /cms/v3/hubdb/tables` |

**Key rule**: If it has an objectTypeId (0-X) → T1, supports Properties API. If it uses a dedicated API path outside the objectTypeId system → T3, static schema.

## Custom Fields & Tables

| Source | What | Where | Discovery API |
|--------|------|-------|---------------|
| Custom Properties | User-added columns on existing CRM objects | Any T1 object | `GET /crm/v3/properties/{objectType}` |
| Custom Objects | User-defined entire tables + columns | CRM, Enterprise only (2-X objectTypeId) | `GET /crm/v3/schemas` |
| Activatable Objects | HubSpot-defined but opt-in objects | CRM Object Library | `GET /crm/v3/object-library/enablement` |
| HubDB | User-defined CMS structured data tables | Content Hub | `GET /cms/v3/hubdb/tables` |

---

## T1: CRM Objects — Dynamic Schema (38 objects)

All support `GET /crm/v3/properties/{objectType}` for live column discovery including custom properties.

### CRM Core
| # | Object | objectTypeId | API Path |
|---|--------|-------------|----------|
| 1 | Contacts | 0-1 | `/crm/v3/objects/contacts` |
| 2 | Companies | 0-2 | `/crm/v3/objects/companies` |
| 3 | Deals | 0-3 | `/crm/v3/objects/deals` |
| 4 | Leads | 0-4 | `/crm/v3/objects/leads` |
| 5 | Tickets | 0-5 | `/crm/v3/objects/tickets` |
| 6 | Products | 0-7 | `/crm/v3/objects/products` |
| 7 | Line Items | 0-8 | `/crm/v3/objects/line_items` |

### Engagements / Activities
| # | Object | objectTypeId | API Path |
|---|--------|-------------|----------|
| 8 | Communications | 0-18 | `/crm/v3/objects/communications` |
| 9 | Feedback Submissions | 0-19 | `/crm/v3/objects/feedback_submissions` |
| 10 | Tasks | 0-27 | `/crm/v3/objects/tasks` |
| 11 | Notes | 0-46 | `/crm/v3/objects/notes` |
| 12 | Meetings | 0-47 | `/crm/v3/objects/meetings` |
| 13 | Calls | 0-48 | `/crm/v3/objects/calls` |
| 14 | Emails (logged) | 0-49 | `/crm/v3/objects/emails` |
| 15 | Postal Mail | 0-116 | `/crm/v3/objects/postal_mail` |

### Commerce
| # | Object | objectTypeId | API Path |
|---|--------|-------------|----------|
| 16 | Quotes | 0-14 | `/crm/v3/objects/quotes` |
| 17 | Invoices | 0-53 | `/crm/v3/objects/invoices` |
| 18 | Commerce Subscriptions | 0-69 | `/crm/v3/objects/subscriptions` |
| 19 | Goal Targets | 0-74 | `/crm/v3/objects/goal_targets` |
| 20 | Discounts | 0-84 | `/crm/v3/objects/discounts` |
| 21 | Fees | 0-85 | `/crm/v3/objects/fees` |
| 22 | Taxes | 0-86 | `/crm/v3/objects/taxes` |
| 23 | Commerce Payments | 0-101 | `/crm/v3/objects/commerce_payments` |
| 24 | Users | 0-115 | `/crm/v3/objects/users` |
| 25 | Orders | 0-123 | `/crm/v3/objects/orders` |
| 26 | Carts | 0-142 | `/crm/v3/objects/carts` |

### Marketing (CRM-backed)
| # | Object | objectTypeId | API Path |
|---|--------|-------------|----------|
| 27 | Marketing Events | 0-54 | `/crm/v3/objects/marketing_events` |

### Activatable (Object Library)
| # | Object | objectTypeId | API Path |
|---|--------|-------------|----------|
| 28 | Services | 0-162 | `/crm/v3/objects/services` |
| 29 | Courses | 0-410 | `/crm/v3/objects/courses` |
| 30 | Listings | 0-420 | `/crm/v3/objects/listings` |
| 31 | Appointments | 0-421 | `/crm/v3/objects/appointments` |

### System / Other CRM
| # | Object | objectTypeId | API Path |
|---|--------|-------------|----------|
| 32 | Projects | 0-970 | `/crm/v3/objects/projects` |
| 33 | Contracts | TBD | `/crm/v3/objects/contracts` |
| 34 | Deal Splits | TBD | `/crm/v3/objects/deal_splits` |
| 35 | Transcriptions | TBD | `/crm/v3/objects/transcriptions` |
| 36 | Partner Clients | TBD | `/crm/v3/objects/partner_clients` |
| 37 | Partner Services | TBD | `/crm/v3/objects/partner_services` |
| 38 | Subscription Lifecycle | TBD | `/crm/v3/objects/subscription_lifecycle` |

> Objects 33-38 are newly confirmed from the API catalog. "TBD" objectTypeIds need resolution via `GET /crm/v3/schemas` or Object Library API on a live account.

---

## T2: Custom Objects — User-Defined Tables (1 API, unlimited tables)

| # | Object | objectTypeId | Discovery |
|---|--------|-------------|-----------|
| 39 | Custom Objects (per tenant) | 2-XXXXXXXX | `GET /crm/v3/schemas` |

---

## T3: Static Schema — No Custom Columns (38 objects)

These use dedicated API paths, have fixed fields defined by HubSpot's API spec. No Properties API, no custom fields. Static metadata JSON is the source of truth.

### CMS / Content Hub
| # | Object | API Group |
|---|--------|-----------|
| 40 | Blog Posts | CMS |
| 41 | Blog Authors | CMS |
| 42 | Blog Tags | CMS |
| 43 | Blog Settings/Config | CMS |
| 44 | Site Pages & Landing Pages | CMS |
| 45 | Domains | CMS |
| 46 | URL Mappings | CMS |
| 47 | URL Redirects | CMS |
| 48 | Site Search | CMS |
| 49 | Content Audit Logs | CMS |
| 50 | Source Code (themes/templates) | CMS |
| 51 | Media Bridge | CMS |

### CRM Config
| # | Object | API Group |
|---|--------|-----------|
| 52 | Owners | CRM |
| 53 | Pipelines (deals + tickets) | CRM |
| 54 | Lists / Segments | CRM |
| 55 | Forecasts | CRM |

### Files
| # | Object | API Group |
|---|--------|-----------|
| 56 | Files & Folders | Files |

### Marketing
| # | Object | API Group |
|---|--------|-----------|
| 57 | Campaigns | Marketing |
| 58 | Marketing Emails | Marketing |
| 59 | Forms | Marketing |
| 60 | Transactional Single Send | Marketing |
| 61 | Single-send (v4) | Marketing |

### Communication
| # | Object | API Group |
|---|--------|-----------|
| 62 | Email Subscription Types & Prefs | Communication Preferences |

### Conversations
| # | Object | API Group |
|---|--------|-----------|
| 63 | Inbox Threads & Messages | Conversations |
| 64 | Custom Channels | Conversations |
| 65 | Visitor Identification | Conversations |

### Events / Analytics
| # | Object | API Group |
|---|--------|-----------|
| 66 | Custom Behavioral Events | Events |
| 67 | Event Completions | Events |

### Automation
| # | Object | API Group |
|---|--------|-----------|
| 68 | Sequences & Enrollments | Automation |
| 69 | Workflows (v4) | Automation |

### Scheduler
| # | Object | API Group |
|---|--------|-----------|
| 70 | Meeting Scheduler / Booking Pages | Scheduler |

### Settings
| # | Object | API Group |
|---|--------|-----------|
| 71 | Currencies & Exchange Rates | Settings |
| 72 | Tax Rates | Settings |
| 73 | User Provisioning (SCIM) | Settings |

### Account
| # | Object | API Group |
|---|--------|-----------|
| 74 | Account Info & Usage | Account |
| 75 | Audit Logs | Account |
| 76 | Business Units / Brands | Business Units |

### Data Studio
| # | Object | API Group |
|---|--------|-----------|
| 77 | Datasource Ingestion (beta) | Data Studio |

---

## HubDB: User-Defined CMS Tables (1 API, unlimited tables)

| # | Object | API Group |
|---|--------|-----------|
| 78 | HubDB Tables + Rows | CMS |

---

## Connector Implementation Rules

1. **T1 (CRM)**: Use `GET /crm/v3/properties/{objectType}` for field discovery. This returns ALL fields including custom properties. The `IsCRMObject()` check uses objectTypeId presence.

2. **T2 (Custom Objects)**: Discover via `GET /crm/v3/schemas`. Each custom object gets its own Properties API endpoint. objectTypeId starts with `2-`.

3. **T3 (Static)**: `DiscoverNonCRMFields` returns empty → falls back to DB-cached static metadata from `.hubspot.json`. NO API calls needed for field discovery. The static metadata JSON must be complete per HubSpot's API spec.

4. **HubDB**: Discover tables via `GET /cms/v3/hubdb/tables`, columns via `GET /cms/v3/hubdb/tables/{tableId}`.

## Summary Counts

| Category | Count | Custom Columns? |
|----------|-------|-----------------|
| T1: CRM Objects | 38 | Yes |
| T2: Custom Objects | 1 API -> unlimited | Yes |
| T3: Static Schema | 38 | No |
| HubDB | 1 API -> unlimited | Yes |
| Meta/Infrastructure | 15 | N/A |
| Developer Tooling | 7 | N/A |
| **TOTAL** | **100 APIs** | **78 data-bearing** |
