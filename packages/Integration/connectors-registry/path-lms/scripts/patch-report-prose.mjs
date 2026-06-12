#!/usr/bin/env node
// patch-report-prose.mjs — bring the EXTRACTION_REPORT.md narrative totals into
// agreement with the FINAL metadata after the id-less *Id-PK demotion round.
// The matrix + per-row PK table were already realigned by regen-report-from-metadata.ts;
// this fixes the prose summary sentences (totals, PK section narrative) so the report
// renders the metadata exactly (no drift).

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..', '..', '..', '..');
const P = resolve(REPO_ROOT, 'packages/Integration/connectors-registry/path-lms/output/EXTRACTION_REPORT.md');

let t = readFileSync(P, 'utf8');
const before = t;
const edits = [];

function sub(needle, repl, label) {
    if (!t.includes(needle)) { edits.push(`MISS: ${label}`); return; }
    t = t.replace(needle, repl);
    edits.push(`OK:   ${label}`);
}
function subRe(re, repl, label) {
    if (!re.test(t)) { edits.push(`MISS: ${label}`); return; }
    t = t.replace(re, repl);
    edits.push(`OK:   ${label}`);
}

// 1. Totals line
sub(
    '**Totals:** 84 IOs · 1175 IOFs · 78/84 IOs with an emitted soft PK · 200 FK edges across 69 IOs.',
    '**Totals:** 84 IOs · 1175 IOFs · 67/84 IOs with an emitted soft PK (id-bearing) · 17/84 PK-less (content-hash identity) · 210 FK edges across 69 IOs.',
    'totals line',
);

// 2. §3.1 heading
sub(
    '### 3.1 PK — 78 emitted, 6 deferred (zero-PK value objects)',
    '### 3.1 PK — 67 emitted (sole `id`), 17 PK-less (content-hash identity)',
    '§3.1 heading',
);

// 3. Universal-PK bullet
subRe(
    /- \*\*Universal-PK convention\.\*\* `id: ID!` is the vendor-wide identity convention across >95% of named object types \(`Configuration\.universalPK = \{ fieldName: 'id' \}`\)\. Each object whose SDL Fields table carries `id` emits `IsPrimaryKey=true` on it \(soft key — a wrong soft PK cannot reject a row; a PK-less object stalls CodeGen, so the bias is emit\)\./,
    "- **Universal-PK convention.** `id: ID!` is the vendor-wide identity convention across >95% of named object types (`Configuration.universalPK = { fieldName: 'id' }`). All **67** IOs that carry a literal `id` field emit `IsPrimaryKey=true` on it, and `id` is their **sole** PK (soft key — a wrong soft PK cannot reject a row; a PK-less object stalls CodeGen, so the bias is emit where a real identity column exists).",
    'universal-PK bullet',
);

// 4. Replace the now-WRONG "Non-id identity by description" bullet
subRe(
    /- \*\*Non-`id` identity by description\.\*\* Where the SDL names a different row identity in prose.*?`Webinar\*Report\.webinarId` is the report's own key\./s,
    "- **No fabricated identity on id-less rows (this round).** An object with NO literal `id` field does NOT get a `*Id` field promoted to PK — a `*Id` field references ANOTHER object (a foreign key), never the row's own identity. The 11 id-less report/projection types that previously mislabelled a `*Id` field as PK (`CategorySale`/`SaleByBundle`/`InPersonEvent*`/`Webinar*User`/`UserItemVisits`.`userId`, `Webinar*Report.webinarId`, `ProductCatalog.sellableApiId`) are now **PK-less**: identity is carried by the engine content-hash (correct for a keyless projection), and the demoted `*Id` becomes a foreign key to its referenced IO where one is emitted (`userId`→`User`, `webinarId`→`Webinar`; `sellableApiId` references no emitted IO → plain field).",
    'non-id-identity bullet',
);

// 5. Zero-PK value objects bullet (6 -> 17)
subRe(
    /- \*\*Zero-PK value objects \(6, deferred to content-hash identity\):\*\*.*?PK deferred to runtime D4 if live data shows a stable identity\./s,
    "- **PK-less IOs (17, content-hash identity):** the 6 zero-PK value objects — `Account` (L1 container), `AssessmentQuestion`, `AssessmentSubmission`, `ContentSaleOrderItem` (line-item value object referencing parent `Order`), `SaleByCategory`, `UserCourseItemView` (nested result shapes) — plus the **11 id-less report/projection types** demoted this round: `CategorySale`, `InPersonEventCancellation`, `InPersonEventRegistrationUser`, `InPersonEventUser`, `ProductCatalog`, `SaleByBundle`, `UserItemVisits`, `WebinarArchiveViewerUser`, `WebinarCancellationUser`, `WebinarLiveAttendeeReport`, `WebinarRegistrationReport`. None has a row-identity field in the SDL. The base `ToExternalRecord` content-hash fallback keeps them syncable and dedupable; PK deferred to runtime D4 if live data shows a stable identity.",
    'zero-PK-value-objects bullet',
);

// 6. §3.3 FK heading 200 -> 210
sub(
    '### 3.3 FK — 200 edges across 69 IOs (Tier-1 typed/described references)',
    '### 3.3 FK — 210 edges across 69 IOs (Tier-1 typed/described references)',
    '§3.3 FK heading',
);

// 7. Final summary line
sub(
    '- 0 empty IOs; 78/84 carry a soft PK; the 6 zero-PK objects are proven value objects deferred to content-hash identity.',
    '- 0 empty IOs; 67/84 carry a soft `id` PK; the 17 PK-less IOs (6 value objects + 11 id-less report/projection types) carry identity via content-hash.',
    'final summary line',
);

if (t === before) { console.error('NO CHANGES MADE.\n' + edits.join('\n')); process.exit(1); }
writeFileSync(P, t);
console.log(edits.join('\n'));
console.log('Report prose patched.');
