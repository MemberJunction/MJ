---
"@memberjunction/integration-connectors": minor
"@memberjunction/integration-engine": patch
---

Add the **Eventbrite** connector — Eventbrite Platform REST API v3.

- **`EventbriteConnector`** (`@memberjunction/integration-connectors`) extends `BaseRESTIntegrationConnector`: OAuth2 Bearer / private-token auth, `continuation`-cursor pagination, and `changed_since` incremental sync on Orders & Attendees. CRUD is delegated to the generic per-operation column path (v5.39.x); the documented write surfaces (Event, EventSeries, Venue, TicketClass, TicketGroup, Discount, Webhook, Question) are wired with wrapped/flat bodies, while Orders & Attendees stay read-only per the public API.
- **Metadata** (`metadata/integrations/eventbrite/`): 18 Integration Objects / 242 fields / 23 FK edges, all docs-derived from the official Eventbrite Platform API v3 reference (no invented fields). Organization-/event-scoped list paths declare `Configuration.parentObjectName` so the engine resolves `{organization_id}` / `{event_id}` via parent-iteration — no base-class change required. Passes the bijection, dag-completeness, and fk-lookup-qualifier floor graders.
- **Credential type** `Eventbrite OAuth Token` (private token or OAuth2 authorization-code app credentials).
- **Tests**: 74 credential-free mock tests covering every table (flat tables end-to-end; parent/connection-scoped tables at the response-contract layer), TestConnection, NormalizeResponse, cursor pagination, `changed_since` emission, watermark advancement, CRUD body shaping, and the capability⟺per-op-column bijection over the shipped metadata.

Verification ceiling: **contract-verified** (matches Eventbrite's published Platform API v3). No live API calls — Eventbrite tokens are self-serve, so a live read-only pass can be added later via `/test-connector` without a rebuild.

Also fixes a pre-existing duplicate `ExtraParams` declaration in `@memberjunction/integration-engine`'s `OAuth2TokenManager` interface that blocked the engine from compiling.
