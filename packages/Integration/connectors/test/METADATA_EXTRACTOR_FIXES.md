# Metadata + Extractor Fixes (E5 / D3 / E3 / D4) + Investigations (D2 / D1)

Date: 2026-06-17. Scope: real metadata + extractor edits only (NO codegen / metadata-sync core touched).
All edited JSON re-validated as parseable.

---

## E5 — FK `@lookup` qualifier (`@parent:ID` → `@parent:IntegrationID`)

Clean find-replace of the **`&IntegrationID=@parent:ID`** lookup-query qualifier only. The bare
`"IntegrationObjectID": "@parent:ID"` value (correct) was NOT touched — verified: salesforce scripts
still hold 4× `'@parent:ID'` each.

| File | Occurrences fixed |
|---|---|
| `.claude/agents/ioiof-extractor.md` (the prescribing rule; actual path is `agents/`, not `connector-agent/`) | 1 (line 85, default sparse-graph FK template) |
| `packages/Integration/connectors-registry/netsuite/scripts/extract-io-iof.ts` | 2 (rich-field FK + child-sublist FK) |
| `packages/Integration/connectors-registry/salesforce/scripts/extract-io-iof.ts` | 2 (system-field FK + per-object reference FK) |
| `packages/Integration/connectors-registry/salesforce/scripts/extract-io-iof-all.ts` | 2 (same two) |

Before: `` `@lookup:MJ: Integration Objects.Name=${tgt}&IntegrationID=@parent:ID` ``
After:  `` `@lookup:MJ: Integration Objects.Name=${tgt}&IntegrationID=@parent:IntegrationID` ``

Rationale: `@parent:IntegrationID` reads the parent IO's resolved `IntegrationID`; `@parent:ID` wrongly
gives the parent IO's own row id (the known build/path-lms defect — see memory
`project_connector_fk_lookup_parent_integrationid`).

---

## D3 — same bug in the REAL (deployable) metadata files

`&IntegrationID=@parent:ID` → `&IntegrationID=@parent:IntegrationID`, count per file:

| File | Occurrences fixed |
|---|---|
| `metadata/integrations/hivebrite/.hivebrite.integration.json` | 62 |
| `metadata/integrations/openwater/.openwater.integration.json` | 25 |
| `metadata/integrations/path-lms/.path-lms.integration.json` | 66 |

(`.backups/*.bak` copies intentionally left as-is.) Post-fix grep for the old form across all three = 0.

---

## E3 — stop the extractor emitting non-deployable fields (`IsForeignKey`, `Source`)

`IsForeignKey` is not a DB column (the persisted FK is `RelatedIntegrationObjectID`); `Source` is not a
column (the source field is `MetadataSource`, set by the persistence pipeline, never authored). Both are
silently no-op'd by `BaseEntity.SetLocal`. Removed from the **persisted field objects** while KEEPING the
real FK markers (`RelatedIntegrationObjectID` + `Configuration.ReferencedType`). The `IsForeignKey` slot
strings inside `claims.push({...})` (verify-claim slot names, e.g. `iof.X.IsForeignKey`) were left intact —
those are evidence-claim identifiers, not persisted field keys.

| File | Change |
|---|---|
| `connectors-registry/netsuite/scripts/extract-io-iof.ts` | Removed `iof.IsForeignKey = true;` (rich-field block) and inline `IsForeignKey: true,` (child-sublist literal). Added `ReferencedType` into the `Configuration` for both so the soft-FK marker persists. Netsuite emits no `Source`. |
| `connectors-registry/salesforce/scripts/extract-io-iof.ts` | Removed 2× `f.IsForeignKey = true;` statements and 4× `Source: 'Declared',` entries (1 IO-level object + 3 IOF objects). `RelatedIntegrationObjectID`, `RelatedIntegrationObjectFieldName`, and `Configuration.ReferencedType` retained — FK fully survives. |
| `connectors-registry/salesforce/scripts/extract-io-iof-all.ts` | Same: removed 2× `f.IsForeignKey = true;` and 4× `Source: 'Declared',`. |
| `connectors-registry/path-lms/scripts/extract-io-iof.ts` | Removed `IsForeignKey: !!fkTarget,` from the persisted `iof` literal. Soft-FK already persists via `Configuration.ReferencedType` (set just above at line 449). |
| `.claude/agents/ioiof-extractor.md` (rule) | Added a leading note before the FK gate: `IsForeignKey`/`Source` are NOT deployable columns; "emit `IsForeignKey=true`" means write `RelatedIntegrationObjectID` + `Configuration.ReferencedType`, never literal `IsForeignKey`/`Source`/`MetadataSource` keys. Reworded "Emit `IsForeignKey`" → "Treat `IsForeignKey`" in that sentence. |

Scanned all 4 `connectors-registry/*/scripts/extract-io-iof*.ts` (netsuite, salesforce ×2, path-lms);
post-fix scan for persisted `IsForeignKey`/`Source` emission = clean.

---

## D4 — salesforce missing required Integration root fields

`metadata/integrations/salesforce/.salesforce.integration.json` (single-record array, root `fields`).
The keys WERE present but set to `null` (NOT-NULL columns → that null IS the defect). Set to sensible
values:

Before: `"BatchMaxRequestCount": null,` / `"BatchRequestWaitTime": null,`
After:  `"BatchMaxRequestCount": 200,`  / `"BatchRequestWaitTime": 100,`

---

## D2 — stale root-level strays (REPORT ONLY — not deleted)

Root-level files `metadata/integrations/.*.json`. Of the 23, **exactly 4 are stale duplicates** of a
connector that also has a per-vendor subdir `<vendor>/.<vendor>.integration.json`:

| Stray | Duplicate of | Shape |
|---|---|---|
| `metadata/integrations/.salesforce.json` | `salesforce/.salesforce.integration.json` | pull-style (has `primaryKey` + `sync`) |
| `metadata/integrations/.imis.json` | `imis/.imis.integration.json` | pull-style (has `primaryKey` + `sync`) |
| `metadata/integrations/.netsuite.json` | `netsuite/.netsuite.integration.json` | pull-style (has `primaryKey` + `sync`) |
| `metadata/integrations/.fonteva.json` | `fonteva/.fonteva.integration.json` | top-level dup (no `primaryKey`/`sync`) |

**NOT strays — leave alone:**
- `.mj-sync.json` — the `MJ: Integrations` entity config (filePattern `**/.*.json`, newFileName `.integrations.json`).
- `.integrations.json` — the pull-target aggregate file the config writes to.
- The remaining 17 (`.aptify`, `.betty`, `.blackbaud`, `.constant-contact`, `.hubspot`, `.magnet-mail`,
  `.mailchimp`, `.mjtomj`, `.netforum`, `.quickbooks`, `.rasa`, `.reach360`, `.sage-intacct`,
  `.sharepoint`, `.wicket`, `.wild-apricot`, `.your-membership`) have NO per-vendor subdir — they are
  not duplicates and were left out of scope.

**Action for human:** confirm before deleting the 4 duplicates above.

---

## D1 — committable-deletes viability (INVESTIGATE ONLY — no deletes authored)

**Verdict: AUTHORING THE DELETES IS VIABLE — the baseline-seeded IO IDs are deterministic & findable**
(same shape as nimble's `.old-nimble-seed.deletes.json`, keyed on a hardcoded `primaryKey.ID`).

ID source (all hardcoded GUID literals; **zero** `NEWID(`/`NEWSEQUENTIALID` in any of these seed files):

| Vendor | Deterministic Integration root ID | IO seed file | IO rows |
|---|---|---|---|
| iMIS | `5d720f00-0a8f-4c17-a871-124dcfc88c0e` | `migrations/v5/V202605211738__v5.36.x__Metadata_Sync.sql` | 43 (via `@IntegrationID_xxx = '...'` SET vars) |
| GrowthZone | `248e9418-6e27-469b-b7b5-2c4a863a4051` | `migrations/v5/V202605211738__v5.36.x__Metadata_Sync.sql` | 26 |
| PropFuel | `be217e30-59db-4208-9c41-2104f135bb8d` | `migrations/v5/V202605211738__v5.36.x__Metadata_Sync.sql` | 6 |
| Salesforce | `90687B09-3181-4C24-B94F-84EDB108F8A7` | `migrations/v5/V202603221948__v5.15.x__Metadata_Sync.sql` (carried into v5.34/v5.37/v5.38 baselines, 41× literal) | SF IOs seeded INLINE in v5.15 with deterministic GUIDs — a different reference shape than the `@IntegrationID_xxx` SET-var pattern, so a SET-var regex misses them, but each IO row's `@ID` is still a hardcoded literal. |

Model reference: nimble's `metadata/integration-object-deletes/.old-nimble-seed.deletes.json` — each
record is `{ fields:{Name}, primaryKey:{ID: <deterministic GUID>}, deleteRecord:{delete:true} }`. The same
pattern is constructible for all four vendors by harvesting the per-IO `@ID` literals from the seed files
above and pairing them with each IO's `@Name`.

Per the prompt, the deletes files were **NOT authored** — this is the viability report only. To author
them, extract the `(Name, @ID)` pairs per vendor from the cited seed files (iMIS/GZ/PropFuel from v5.36's
SET-var blocks; SF from v5.15's inline literals) and emit them as TOP-LEVEL `deleteRecord` records under
`MJ: Integration Objects` (with `--delete-db-only` for dependent IOFs), exactly as the
metadata-file-conventions rebuild recipe prescribes.
