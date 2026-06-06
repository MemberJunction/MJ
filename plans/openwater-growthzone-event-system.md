# [New Event System] OpenWater + GrowthZone enhancement — Plan

**Branch:** `connectors/openwater_growthzone`
**Worktree:** `/Users/madhavsubramaniyam/Projects/MJ/MJ-openwater`
**Status:** Draft plan (pre-PR). No PR raised yet.

## 1. Context

Two distinct pieces of work united by the **event-management** theme:

- **OpenWater — new connector (green-field).** OpenWater is an event / awards / abstracts / application
  management platform with a REST API. No connector exists in the repo today
  (`packages/Integration/connectors/src/` has no `OpenWaterConnector.ts`). This is a from-scratch
  `BaseRESTIntegrationConnector` build.
- **GrowthZone — enhance the existing connector.** `GrowthZoneConnector.ts` already ships on `next`
  (`IntegrationName: 'GrowthZone'`, extends `BaseRESTIntegrationConnector`), but it is currently
  **read-only** and shallow on events:
  - Objects: Contacts, Groups/committees, **Events**, Invoices, Payments, Certifications — **all
    `SupportsWrite: false`**.
  - Incremental: **only** `/api/contacts/delta` (contacts). Other objects fall back to Offset pagination
    with no incremental signal.
  - Custom-field discovery via `POST /api/customfields/getall`; field discovery is live.

  The "Event System" framing points the enhancement squarely at GrowthZone's **event surface** — the
  current single read-only `Events` object is too thin for an event-system integration.

## 2. OpenWater connector — scope (new)

Standard connector build per repo conventions (`.claude/rules/connector-code-conventions.md`):
- `@RegisterClass(BaseIntegrationConnector, 'OpenWaterConnector')`, `IntegrationName: 'OpenWater'`,
  extends `BaseRESTIntegrationConnector`.
- **Auth** — confirm scheme from OpenWater docs (API key / token); use `auth-helpers`, never inline crypto.
- **Discovery** — pick the mode by what OpenWater exposes (rule: customs must be captured):
  - LIVE introspection if a schema/describe endpoint exists; else
  - SAMPLE-discovery (fetch a page, union flattened keys, emit extras as nullable) if data is reachable; else
  - STATIC catalog **only** if the schema is genuinely fixed.
- **Objects (to confirm from docs/API, not invented)** — the event-system core: Programs/Events,
  Applications/Submissions, Registrations/Attendees, Forms, Users/Judges, Payments. Curate from the real
  API surface.
- **CRUD + incremental** — wire per-operation columns only for capabilities OpenWater actually supports;
  set `IncrementalWatermarkField` if a modified-since cursor exists.

## 3. GrowthZone enhancement — scope (event-focused)

Keep changes additive and provable; do not regress the working read-only objects (repo memory: "never
change working code to fix broken code").

1. **Deepen the event surface** — add the event child/related objects GrowthZone's API exposes
   (event registrations / attendees, sessions, ticket types) as their own IOs with correct FK
   (`IsForeignKey` + `ForeignKeyTarget`) back to `Events`, so the sync DAG/traversal order is right.
2. **Incremental for events** — investigate whether GrowthZone offers a delta/modified-since endpoint for
   events analogous to `/api/contacts/delta`; if yes, set `SupportsIncrementalSync` + `IncrementalWatermarkField`.
   If not, use the keyset/content-hash path and **log** the absence (no fabricated watermark).
3. **Write support (only if the vendor supports it)** — if GrowthZone's API allows event registration
   writes, wire the per-operation Create/Update/Delete columns + `BuildCreatedResult`. Otherwise leave
   `SupportsWrite: false` honestly — no `501` stubs behind a `true` flag.

## 4. Provable-only discipline

- Do **not** hardcode invented OpenWater or GrowthZone object/field lists. Confirm every object, field,
  endpoint, PK/FK, and capability flag from the vendor API docs / OpenAPI / a real response, with
  PROVENANCE.json or CODE_EVIDENCE.json backing each hard-constraint emission.
- Emit `undefined` (not `false`) for unprovable booleans (PK/required/nullable) so the persist-time overlay
  doesn't wipe curated values.

## 5. Testing approach (credential triage first)

Per `.claude/rules/connector-credential-testing.md`, classify credential obtainability up front and report
the achievable ceiling for **each** vendor independently:
- **Live (PATH 1)** — if an OpenWater and/or GrowthZone sandbox/dev credential is broker-held or self-serve,
  run the ordered §1→§7 live E2E on SQL Server (PG suspended for the per-connector loop).
- **Credential-free (PATH 2)** — otherwise mock each REST surface from documented response shapes, replay
  fixtures, status-probe endpoints, and prove discovery→map→CRUD→incremental against a spec-driven mock.
  Label the ceiling `format-verified-no-creds` honestly.
- Mocked vitest tiers (T4/T5): new `OpenWaterConnector.test.ts`; extend `GrowthZoneConnector.test.ts` for
  the new event objects + any incremental/write additions.

## 6. Deliverables for the PR

- [ ] `OpenWaterConnector.ts` + registration in `index.ts` + metadata (provenance-backed)
- [ ] GrowthZone event-surface enhancement (additive, no regression) + metadata updates
- [ ] Tests at the achieved tier for both, with honest residual-gap statements
- [ ] Changeset

## 7. Open questions

1. **Credentials** — is an OpenWater and/or GrowthZone sandbox reachable to us (broker / self-serve)?
   Sets each vendor's test ceiling.
2. **OpenWater object scope** — full surface, or a prioritized v1 (Events + Registrations + Submissions)?
3. **GrowthZone enhancement depth** — events-only, or also add write-back for registrations if the API
   supports it?
4. **GrowthZone event incremental** — does a delta/modified-since endpoint exist for events, or do we ride
   keyset/content-hash?

## Links

- GrowthZone connector: `packages/Integration/connectors/src/GrowthZoneConnector.ts`
- GrowthZone tests: `packages/Integration/connectors/src/__tests__/GrowthZoneConnector.test.ts`
- Connector code conventions: `.claude/rules/connector-code-conventions.md`
- Credential/testing conventions: `.claude/rules/connector-credential-testing.md`
- Metadata file conventions: `.claude/rules/metadata-file-conventions.md`
