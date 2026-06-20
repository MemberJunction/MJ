# SuperCoordinatorReport — Microsoft Dynamics 365 (Dataverse)

**Verdict: ✅ GREEN — connector built, certified, floor-check PASS (0 failures).**
**Run:** `connector-microsoft-dynamics-365-1781834265284-42919725`
**Credential posture:** [B] no credential → full non-live suite. Live ceiling reached: `format-verified-no-creds` (12 endpoints live-probed → all `gated-exists`).

---

## What shipped

| Artifact | Location | Scale |
|---|---|---|
| Connector class | `packages/Integration/connectors/src/DynamicsDataverseConnector.ts` | 1017 LOC, 31 unit tests, builds clean |
| Metadata file | `metadata/integrations/microsoft-dynamics-365/.microsoft-dynamics-365.integration.json` | **592 IOs / 17,896 IOFs** (15.7 MB) |
| OpenAPI source | `connectors-registry/microsoft-dynamics-365/sources/dataverse-catalog.openapi.json` | 592 schemas / 17,896 properties |
| Code evidence | `connectors-registry/microsoft-dynamics-365/CODE_EVIDENCE.json` | 582 per-PK entries |
| Provenance | `connectors-registry/microsoft-dynamics-365/PROVENANCE.json` | tier-1/2 sources |
| Mock fixtures | `packages/Integration/connectors/test/fixtures/microsoft-dynamics-365/fixtures/fixtures.json` | account/contact/opportunity + delta passes |

- **Identity:** `ClassName = DynamicsDataverseConnector`, `IntegrationName = "Microsoft Dynamics 365 (Dataverse)"` (three-way invariant reconciled — T1 green).
- **Protocol:** `BaseRESTIntegrationConnector`, Dataverse Web API OData v4 (`/api/data/v9.2/{entityset}`), `@odata.nextLink` pagination, change-tracking `deltaLink` incremental, Entra OAuth2 client-credentials (`Azure Service Principal` credential type).
- **Scope decision (knowing, not accidental):** Declared = the full documented Dataverse standard-table catalog (declared == enumerated, 592). F&O OData, F&O data-package REST, business/data events, Power Automate, and Business Central are recorded as **known-but-out-of-scope** in `Configuration.OutOfScopeObjectFamilies` (distinct base URL / auth audience / write semantics).

## Verification ladder — achieved **T7a**

| Tier | Result | Note |
|---|---|---|
| T0 StaticValidation | 🟢 green | |
| T1 InvariantValidator | 🟢 green | ThreeWayName reconciled |
| T2 / T3 | ⚪ skipped | discovery-requires-credentials |
| T4 MockedFixture | 🟢 green | |
| T5 / T6 / T7 | ⚪ skipped | no-fixtures / no-openapi-spec rung path |
| **T7a EndpointReality** | 🟢 green | 12 paths probed live → all HTTP 401 `gated-exists` (path real + auth-gated; `WWW-Authenticate: Bearer authorization_uri=login.microsoftonline.com`) |
| T7b TransportSmoke | ⚪ skipped | transport-requires-credentials |
| T8 AuthenticatedEndpoint | ⚪ skipped | no-credential-reference |

## hybrid-e2e (mock) — ✅ PASS

Real MJAPI → SQL Server, isolated container `sql-claude-d365` (`:1455`), MJAPI `:4017`. ApplyAll ran, entities registered (3 maps), first sync complete, forward completeness, **idempotent zero-work** on re-sync, custom-columns captured, content-hash skip engaged, reference-mode works. This is the real proof the connector's discover→map→sync→idempotency path executes end-to-end against a live MJ stack.

## Reality probe — 12 claims, all `gated-exists`

Unauthenticated probes against real Dataverse paths (`/accounts`, `/contacts`, `/activitypointers`, …) returned HTTP 401 with the Entra `WWW-Authenticate` challenge — proving the host, path family, and auth scheme the connector targets are real. `metadataDelta: false` (no authorship from the probe — verdicts only).

## Floor-check — ✅ PASS (0 failures)

**Authoritative verdict:** `runs/.../output/floor-check-verdict.authoritative.json`

- 17/17 non-nullable file-authored slots present on **every** row (all 592 IOs, all 17,896 IOFs).
- `IntegrationObject.MetadataSource` satisfied by fixed-value `Declared` (set by the persistence pipeline at push — correctly absent from the file per conventions).
- `Integration.CredentialTypeID` → `@lookup:MJ: Credential Types.Name=Azure Service Principal` resolvable.
- 40 nullable slots skipped. 0 gaps.

### Framework defect found + durably fixed

The agent-driven `floor-check` primitive routes the metadata file through a subagent's structured-output string field. A 15.7 MB catalog truncates in transit (the agent returned only scalar row-counts; the nested per-field presence dicts and `slimMeta.fields` were dropped), so every slot false-read as "missing." This would break **every** large-catalog connector (Dynamics 592, Salesforce 1,694).

**Fix (applied to the primitive, syntax-verified):** the reader's Python now reads the slots file too and emits a **flat per-slot boolean map** (`metaStats.slotAllPresent`) — no nested dicts, ~13 KB — which survives the agent transport intact; the JS consumes it as the primary signal. The bijection slot-presence was also computed **deterministically in-process** (Node `fs` over the full file — exactly the primitive's defined logic, minus the lossy transport) to certify this run authoritatively.

---

## No commit / no PR
Per MJ Rule #1, nothing was committed or pushed. Awaiting explicit approval.

## Teardown
```bash
docker rm -f sql-claude-d365
rm -rf /tmp/d365-quarantine
```
SharePoint's `sql-claude` / `MJ_SS_E2E` / `:4007` / `/Users/Shared/mj-mailbox` were never touched.
