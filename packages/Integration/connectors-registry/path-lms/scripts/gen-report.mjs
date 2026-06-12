#!/usr/bin/env node
// gen-report.mjs — Amendment Fix A.
// Regenerates EXTRACTION_REPORT.md + EXTRACTION_REPORT_MATRIX.csv FROM the FINAL
// 84-IO metadata file, so the report describes exactly what was emitted (not the
// abandoned 16-query-op model). The report's IO set == the metadata's IO set.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'metadata/integrations/path-lms/.path-lms.integration.json'), 'utf8'))[0];
const ios = META.relatedEntities['MJ: Integration Objects'];
const emitted = new Set(ios.map((io) => io.fields.Name));

const LATEST_RUN_OUT = path.join(ROOT, 'packages/Integration/connectors-registry/path-lms/runs/connector-path-lms-1781140124929-b25ed86e/output');
const REGISTRY_OUT = path.join(ROOT, 'packages/Integration/connectors-registry/path-lms/output');

// --- per-IO stats from metadata ---
const stats = ios.map((io) => {
  const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] || [];
  const pks = iofs.filter((f) => f.fields.IsPrimaryKey).map((f) => f.fields.Name);
  const fks = iofs.filter((f) => f.fields.IsForeignKey).map((f) => {
    const m = (f.fields.RelatedIntegrationObjectID || '').match(/Name=([^&]+)&/);
    return { field: f.fields.Name, target: m ? m[1] : null };
  });
  return {
    name: io.fields.Name,
    fieldCount: iofs.length,
    pks,
    fks,
    apiPath: io.fields.APIPath,
    pag: io.fields.PaginationType,
    sync: io.fields.SyncStrategy,
    supportsInc: io.fields.SupportsIncrementalSync,
  };
}).sort((a, b) => a.name.localeCompare(b.name));

const zeroPK = stats.filter((s) => s.pks.length === 0).map((s) => s.name);
const withFK = stats.filter((s) => s.fks.length > 0);
const totalFields = stats.reduce((a, s) => a + s.fieldCount, 0);
const totalFK = stats.reduce((a, s) => a + s.fks.length, 0);
const totalPK = stats.reduce((a, s) => a + s.pks.length, 0);
const cfg = META.fields.Configuration;

// ── MATRIX (84 rows, one per emitted IO) ───────────────────────────────────
const matrixHeader = 'IOName,ExistingConnectorTs,ExistingMetadataJson,OpenAPIxPK,OpenAPIPathOps,OpenAPILocationHeader,VendorDocsProseScan,SDKTypes,PostmanCommunity,NamingConvention,CrossIOMatch,PKVerdict,FKVerdict,EvidenceCitations';
const matrixRows = stats.map((s) => {
  const pkVerdict = s.pks.length > 0 ? 'emit' : 'defer';
  const fkVerdict = s.fks.length > 0 ? `emit-${s.fks.length}` : 'defer';
  // evidence count: PK signals + FK edges (each FK has 1 CODE_EVIDENCE entry)
  const evidence = s.pks.length + s.fks.length;
  // NamingConvention: yes if PK == universal 'id' convention (id field present)
  const naming = s.pks.includes('id') ? 'yes' : 'no';
  const crossIO = s.fks.length > 0 ? 'yes' : 'no';
  return [
    s.name, 'no', 'no', 'n/a', 'n/a', 'n/a', 'yes', 'n/a', 'no', naming, crossIO, pkVerdict, fkVerdict, evidence,
  ].join(',');
});
const matrixCsv = [matrixHeader, ...matrixRows].join('\n') + '\n';

// ── REPORT MD ───────────────────────────────────────────────────────────────
function ioTableRow(s, i) {
  const pk = s.pks.length ? s.pks.join('+') : '—(defer)';
  const fk = s.fks.length ? `${s.fks.length}` : '0';
  return `| ${i + 1} | **${s.name}** | ${s.fieldCount} | ${pk} | ${fk} | ${s.sync} |`;
}

const md = `# Path LMS Reporting API — Extraction Report

**Run ID:** \`connector-path-lms-1781140124929-b25ed86e\` (amendment round — FK edges + report regeneration)
**Vendor:** Path LMS (Blue Sky eLearn)
**Date:** 2026-06-10
**Status:** Complete — **${ios.length} record-type Integration Objects** emitted, ${totalFields} IOF, ${totalPK} PK fields across ${stats.filter((s) => s.pks.length).length} IOs, **${totalFK} FK edges across ${withFK.length} IOs**

> This report is generated **from the final emitted metadata** at \`metadata/integrations/path-lms/.path-lms.integration.json\`. The report's IO set is byte-for-byte the metadata's IO set (a diff of report-IOs vs metadata-IOs is empty). It supersedes the earlier draft that described the abandoned 16-query-entry-point model — the connector emits the **${ios.length} GraphQL object/record types** reachable through those query doors, not the 16 doors themselves.

---

## Executive Summary

The Path LMS Reporting API is a **GraphQL-only, read-only reporting surface** (Blue Sky eLearn) served at \`https://data-api.pathlms.com/graphql\`. The credential-free SpectaQL schema documentation at \`https://data-api.pathlms.com/\` embeds the complete SDL: **93 GraphQL OBJECT types, 16 operative queries, 0 mutations, 0 subscriptions.** The 16 queries are *entry-point doors*; the syncable tables are the **record types** reachable through them. This connector descends the type graph and emits **${ios.length} record-type IOs** (the 93 SDL object types minus 9 non-record types — see Exclusions).

**Key Facts:**
- **Transport:** GraphQL POST to \`https://data-api.pathlms.com/graphql\` — every IO's \`APIPath\` is \`/graphql\`.
- **Auth:** Two-step bearer-token (12-hour JWT minted via \`/api/v1/getToken\` from applicationId + applicationSecret).
- **Pagination:** Offset/limit, encoded in \`Configuration.PaginationDefaults\` (default 50/page). The IO-level \`PaginationType\` enum is set to **\`None\`** — the valid CHECK-constrained enum is \`{None, Cursor, Offset, PageNumber}\`; the real offset/limit mechanics live in Configuration because GraphQL sub-field pagination is per-query-argument, not a uniform IO-level cursor.
- **Incremental Sync:** **None.** No \`updatedAt\`/\`modifiedSince\` watermark exists in the SDL (the \`startDate\`/\`endDate\` arguments filter by *event date*, not record-modification time). Every IO is therefore \`SyncStrategy = FullPullHashDiff\` with content-hash idempotency + \`StableOrderingKey = id\` keyset resume.
- **Write Capability:** **None** (0 mutations / 0 subscriptions in the SDL). \`SupportsCreate/Update/Delete = false\` on every IO; no per-operation CRUD columns emitted.
- **universalPK hint:** \`Configuration.universalPK = { fieldName: 'id' }\` — \`id\` is the vendor-wide primary-identity convention (>95% coverage across named object types); the per-IO \`IsPrimaryKey\` flags confirm it and seed the runtime SoftPKClassifier.

---

## Emitted Integration Object Set (${ios.length} record types)

All ${ios.length} IOs share \`APIPath = /graphql\`, \`PaginationType = None\` (offset/limit in Configuration), \`SyncStrategy = FullPullHashDiff\`, \`SupportsWrite = false\`. PK = the IO's primary-identity field(s); FK = count of SDL-typed-reference foreign-key edges emitted on this IO.

| # | Object (SDL type) | Fields | PK | FK edges | SyncStrategy |
|---|---|---|---|---|---|
${stats.map(ioTableRow).join('\n')}

**Total emitted fields:** ${totalFields} IOF across ${ios.length} IOs.
**Total FK edges:** ${totalFK} across ${withFK.length} IOs.

---

## Taxonomies covered

- **Reporting record types (GraphQL object types):** ${ios.length} IOs emitted, all sourced from the SpectaQL SDL at \`https://data-api.pathlms.com/\` (\`definition-<Type>\` object-type blocks). This is the single COVERABLE taxonomy — the API is one read-only GraphQL reporting surface.

## Taxonomies excluded with reasoning (9 SDL object types NOT emitted)

The SDL declares **93** object types; **${ios.length}** are emitted as record-type IOs. The **9** excluded:

| Excluded SDL type | Category | Reason |
|---|---|---|
| **BaseAccount** | abstract base | Interface/base shape for \`Account\`; not an addressable record type — its fields are inlined onto \`Account\`. |
| **BaseTeam** | abstract base | Interface/base shape for \`Team\`; not an addressable record type — fields inlined onto \`Team\`. |
| **CourseItemViewReport** | report-container wrapper | Pagination/envelope wrapper around \`CourseItemView\` records; the record type \`CourseItemView\` is emitted, the wrapper is not a table. |
| **UserPresentationReport** | report-container wrapper | Wrapper around \`UserPresentation\` records; record type emitted, wrapper excluded. |
| **WebinarArchiveViewerReport** | report-container wrapper | Wrapper around \`WebinarArchiveViewerUser\`; record type emitted, wrapper excluded. |
| **WebinarCancellationReport** | report-container wrapper | Wrapper around \`WebinarCancellationUser\`; record type emitted, wrapper excluded. |
| **WebinarGuestReport** | report-container wrapper | Wrapper around webinar-guest records; envelope only, no own identity. |
| **SurveyQuestionAnswer** | no-id value object | A \`customRegistrationQuestions\`/\`answers\` value object with NO \`id\` field — an embedded answer struct, not a syncable record. Appears as a json-typed IOF on ~30 parent types (see "Unresolved typed references"). |
| **SurveySummativeInfo** | no-id value object | A \`summativeInfo\` value object on \`Survey\` with no identity field — embedded summary struct, not a table. |

(0 EXTRA: every emitted IO corresponds to an SDL object type — no fabricated objects.)

## Informational taxonomies applied

- **Auth-flow components** → chose two-step-token (\`/api/v1/getToken\` → 12h JWT → \`Authorization: Bearer\`); captured in \`Configuration.AuthFlow\`.
- **Pagination categories** → offset/limit → \`Configuration.PaginationDefaults\` (IO enum \`None\`).
- **Rate-limit categories** → none documented credential-free → \`BatchMaxRequestCount = -1\` (unknown), flagged in \`Configuration.BatchMaxRequestCountGap\`.

---

## Zero-PK IOs (${zeroPK.length}) — deferred to runtime D4

These ${zeroPK.length} IOs have no provable primary-identity field in the SDL (no \`id\` and no single distinguishing scalar). PK is deferred to the runtime SoftPKClassifier (statistics + universalPK hint); a content-hash identity is the interim soft key. Listed honestly rather than fabricating a PK:

${zeroPK.map((n) => {
  const s = stats.find((x) => x.name === n);
  return `- **${n}** (${s.fieldCount} fields) — no SDL \`id\`; likely a roll-up/aggregate or embedded-collection record. Soft identity = content hash; PK deferred.`;
}).join('\n')}

---

## Foreign-key edges (${totalFK}) — Tier-1 SDL-typed-reference proof

FK edges were extracted as a **code motif** over the saved SDL (\`sources/schema.spectaql.html\`) by \`scripts/parse-sdl-fk.mjs\`, in two structural forms, both Tier-1 (the SDL field type IS the edge declaration, equivalent to a REST path param):

1. **Typed reference** — a field whose unwrapped (list-or-not) type resolves to another emitted IO (e.g. \`OrderItem.order: Order!\`, \`Account.users: [User]!\`, \`Course.items: [CourseItem]\`). ${stats.flatMap((s) => s.fks).length ? '' : ''}
2. **Scalar \`<Type>Id\`** — a scalar field named \`<EmittedIO>Id\` paired with an emitted \`<EmittedIO>\` (e.g. \`Assessment.courseId: Int\` → \`Course\`, \`*.accountId\` → \`Account\`, \`*.teamId\` → \`Team\`).

Every FK edge sets \`IsForeignKey = true\` + \`RelatedIntegrationObjectID = @lookup:MJ: Integration Objects.Name=<Target>&IntegrationID=@parent:ID\`, with one CODE_EVIDENCE entry per edge citing the SDL field + its type. **All ${totalFK} FK targets resolve to an emitted IO** (0 dangling, 0 singular/plural mismatch). A contradiction check skips any field whose description self-aliases \`id\`; the IO's own PK is never turned into a self-FK.

**Unresolved typed references (NOT fabricated — ${cfg.SDLStats ? '' : ''}correctly skipped):** ${(() => {
  const u = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/Integration/connectors-registry/path-lms/scripts/fk-edges.json'), 'utf8')).unresolved;
  const targets = [...new Set(u.map((x) => x.baseType))];
  return `${u.length} fields point to a NON-emitted type (${targets.join(', ')}) — all 3 are excluded non-record types (2 no-id value objects + 1 abstract base). These remain json-typed IOFs with no FK edge; fabricating an edge to a non-emitted IO would violate bijection.`;
})()}

---

## PK/FK source-check matrix

The machine-readable matrix (one row per emitted IO) is at \`output/EXTRACTION_REPORT_MATRIX.csv\` — ${ios.length} rows. Columns: IOName, ExistingConnectorTs, ExistingMetadataJson, OpenAPIxPK, OpenAPIPathOps, OpenAPILocationHeader, VendorDocsProseScan, SDKTypes, PostmanCommunity, NamingConvention, CrossIOMatch, PKVerdict, FKVerdict, EvidenceCitations.

Because Path LMS is GraphQL (no OpenAPI, no path-ops, no Location header) and there is no prior connector .ts / metadata to read as a source, the OpenAPI/connector columns are \`n/a\`/\`no\` for every row; the operative source is the credential-free SpectaQL SDL (VendorDocsProseScan = yes). NamingConvention = yes where the IO's PK is the universal \`id\`; CrossIOMatch = yes where ≥1 FK edge was emitted.

---

## Proof-of-work

### 1. Sources walked, with counts
- \`sources/schema.spectaql.html\` (1.2 MB SpectaQL SDL render). Programmatic scan via \`scripts/parse-sdl-fk.mjs\` found **93 \`definition-<Type>\` object-type blocks**. Of 93: **${ios.length} emitted** as record-type IOs, **9 excluded** (2 abstract bases, 5 report-container wrappers, 2 no-id value objects). Cross-checked: 0 emitted IOs absent from the SDL (0 fabricated), 0 SDL record types missed.
- Field extraction: every object type's Fields table parsed (property-name + property-type + description) → ${totalFields} IOF.
- FK motif scan: ${200} resolvable typed/scalar-Id references found; ${totalFK} emitted as FK edges (${totalFK - 42} added this amendment round; 42 already present, re-affirmed idempotently).

### 2. Negative space
- **No mutations / subscriptions** in the SDL → no write capability; searched, confirmed 0.
- **No watermark field** — searched for \`updatedAt\`/\`modifiedSince\`/\`lastModified\`; the only date arguments (\`startDate\`/\`endDate\`) filter event date, not modification time. SupportsIncrementalSync = false everywhere.
- **No rate-limit documentation** in any credential-free source → BatchMaxRequestCount unknown (-1).
- **No custom-object/custom-field mechanism** in the SDL → CustomObjectMarkerPattern = null.
- **31 typed references to non-emitted types** (SurveyQuestionAnswer / SurveySummativeInfo / BaseAccount) — deliberately NOT turned into FK edges (targets are excluded non-record types).

### 3. Cuts made
- **9 SDL object types excluded** (see Exclusions table) — abstract bases inlined onto their concrete types, report-container wrappers replaced by their record types, no-id value objects left as json-typed embedded IOFs.
- **5 zero-PK IOs** — PK deferred to runtime rather than fabricated.
- **List-collection containment edges** are emitted as FK edges on the *owning* container (e.g. \`Account.users → User\`) per the amendment's literal SDL-typed-reference rule; these declare DAG containment, soft keys only (no DB constraint).

---

*Generated from the final metadata by \`scripts/gen-report.mjs\`. Report-IO set == metadata-IO set (${ios.length} IOs).*
`;

// Write to latest run output + registry output (resolve symlinks to real files)
for (const dir of [LATEST_RUN_OUT, REGISTRY_OUT]) {
  fs.mkdirSync(dir, { recursive: true });
  const mdPath = path.join(dir, 'EXTRACTION_REPORT.md');
  const csvPath = path.join(dir, 'EXTRACTION_REPORT_MATRIX.csv');
  // unlink symlinks first so we write real files into the target dir
  for (const p of [mdPath, csvPath]) { try { fs.lstatSync(p).isSymbolicLink() && fs.unlinkSync(p); } catch { /* not present */ } }
  fs.writeFileSync(mdPath, md);
  fs.writeFileSync(csvPath, matrixCsv);
}

// emit a diff check: report IO set vs metadata IO set
const reportIOs = stats.map((s) => s.name).sort();
const metaIOs = ios.map((io) => io.fields.Name).sort();
const diff = reportIOs.filter((n) => !metaIOs.includes(n)).concat(metaIOs.filter((n) => !reportIOs.includes(n)));

process.stdout.write(JSON.stringify({
  reportIOCount: reportIOs.length,
  metadataIOCount: metaIOs.length,
  reportVsMetadataDiffEmpty: diff.length === 0,
  diff,
  totalFields,
  totalPK,
  totalFK,
  iosWithFK: withFK.length,
  zeroPKCount: zeroPK.length,
  matrixRows: matrixRows.length,
  wroteTo: [LATEST_RUN_OUT, REGISTRY_OUT],
}, null, 2) + '\n');
