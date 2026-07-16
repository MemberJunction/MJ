#!/usr/bin/env node
// slot-presence.mjs — the on-disk twin of floor-check's in-workflow metadata slot-presence checks.
//
// WHY: floor-check normally parses the metadata by having its file-reader AGENT return the file's
// verbatim bytes in a structured-output string field, then does the slot-presence loop + nested-parent
// gate in the (filesystem-less) workflow JS. For a LARGE catalog (e.g. Higher Logic Vanilla: 65 IOs /
// 795 IOFs / ~650KB pretty-printed) that verbatim round-trip TRUNCATES → JSON.parse throws → metaRoot is
// null → EVERY metadata-dependent slot check cascade-fails (`metadata-file-unreadable` +
// `unprovable-required`/`slot-not-filled` "zero Integration Object rows"), even though the metadata is
// perfectly valid on disk. The structural fields (Name/Type/PK/FK/@lookup refs) ARE the bulk, so
// slimming can't shrink it enough. So we move the checks on-disk (mirroring bijection.mjs/dag.mjs/
// enumerate-catalog.mjs, which already read the file directly) and emit only COMPACT violations.
//
// This is a FAITHFUL PORT of floor-check.workflow.js's:
//   - nested-object parent-resolution gate  (the `unresolved-nested-parent` rule)
//   - per-slot value-presence + dangerous-constraint-evidence loop (the `unprovable-required` /
//     `slot-not-filled` / `slot-not-verified` rules, plus the filled/verified/nullableSkipped counters)
// Keep it in lockstep with that file; floor-check falls back to this grader's output ONLY when the
// in-workflow verbatim parse fails (large-catalog path), so small connectors are unaffected.
//
// Usage:
//   node slot-presence.mjs <metadataFile> <slotsFile> <provenanceFile> <codeEvidenceFile> <buildClean:0|1> <connectorFile>
// Emits (stdout): { rootPresent, ioCount, iofCount, filled, verified, nullableSkipped, violations:[{rule,slot,detail}] }

import { readFileSync, existsSync } from 'node:fs';

const [, , metadataFile, slotsFile, provenanceFile, codeEvidenceFile, buildCleanArg, connectorFile] = process.argv;
const buildClean = String(buildCleanArg) === '1';
const connectorFileExists = !!(connectorFile && existsSync(connectorFile));

const readJSON = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

const out = { rootPresent: false, ioCount: 0, iofCount: 0, filled: 0, verified: 0, nullableSkipped: 0, violations: [] };
const fail = (rule, slot, detail) => out.violations.push(slot ? { rule, slot, detail } : { rule, detail });

// ── Parse the metadata + slots on disk. ──
const parsedMeta = metadataFile && existsSync(metadataFile) ? readJSON(metadataFile) : null;
if (parsedMeta === null) { fail('metadata-file-unreadable', null, `could not read/parse metadata file at ${metadataFile}`); console.log(JSON.stringify(out)); process.exit(0); }
const metaRoot = Array.isArray(parsedMeta) ? (parsedMeta[0] ?? null) : parsedMeta;
if (!metaRoot || typeof metaRoot !== 'object') { fail('metadata-file-unreadable', null, 'metadata file parsed but had no root record'); console.log(JSON.stringify(out)); process.exit(0); }
out.rootPresent = true;

const slotsDoc = slotsFile && existsSync(slotsFile) ? readJSON(slotsFile) : null;
const slots = Array.isArray(slotsDoc?.slots) ? slotsDoc.slots : [];

const pickArr = (re, ...names) => {
    if (!re || typeof re !== 'object') return [];
    for (const n of names) if (Array.isArray(re[n])) return re[n];
    const firstArr = Object.values(re).find((v) => Array.isArray(v));
    return Array.isArray(firstArr) ? firstArr : [];
};
const integrationFields = (metaRoot && metaRoot.fields) || {};
const ioRows = pickArr(metaRoot.relatedEntities, 'MJ: Integration Objects', 'Integration Objects');
const allIOFRows = ioRows.map((io) => pickArr(io && io.relatedEntities, 'MJ: Integration Object Fields', 'Integration Object Fields')).flat();
out.ioCount = ioRows.length;
out.iofCount = allIOFRows.length;

// ── Nested-object parent-resolution gate (port of floor-check 307-340). ──
{
    const normP = (p) => '/' + String(p || '').replace(/^\/+|\/+$/g, '') + '/';
    const flatByPath = new Map();
    for (const io of ioRows) { const ap = io && io.fields && io.fields.APIPath; if (ap && !String(ap).includes('{')) flatByPath.set(normP(ap), io.fields.Name); }
    const cfgOf = (io) => { const c = io && io.fields && io.fields.Configuration; if (c && typeof c === 'object') return c; if (typeof c === 'string') { try { return JSON.parse(c); } catch { return {}; } } return {}; };
    const unresolvedNested = [];
    for (const io of ioRows) {
        const f = io && io.fields; if (!f) continue;
        const ap = String(f.APIPath || '');
        const varIdxs = [...ap.matchAll(/\{(\w+)\}/g)];
        if (varIdxs.length === 0) continue;
        const iofs = pickArr(io.relatedEntities, 'MJ: Integration Object Fields', 'Integration Object Fields');
        const cfg = cfgOf(io);
        const hasFKForVar = (v) => iofs.some((x) => x && x.fields && x.fields.RelatedIntegrationObjectID && String(x.fields.Name || '').toLowerCase() === v.toLowerCase());
        for (const vi of varIdxs) {
            const varName = vi[1];
            // A leading template var (first path segment) is a by-id self-ref, not a parent-iteration — not gated.
            const before = ap.slice(0, vi.index).replace(/\/+$/, '');
            if (before === '' || before === '/') continue;
            const parentIsSibling = flatByPath.has(normP(before));
            if (!parentIsSibling) continue; // parent is not a sibling IO → not a parent-iteration gate
            const parentObjName = cfg.parentObjectName || (cfg.parentObjects && cfg.parentObjects[varName]);
            const resolved = !!parentObjName || hasFKForVar(varName);
            if (!resolved) unresolvedNested.push(`${f.Name}{${varName}}`);
        }
    }
    if (unresolvedNested.length > 0) {
        fail('unresolved-nested-parent', null, `${unresolvedNested.length} parent-iteration template-var object(s) have a parent that EXISTS as a sibling object but is NOT resolvable (no Configuration.parentObjectName / parentObjects[var] / exact-name FK) — the engine skips them → 0 rows in prod. Offenders: ${unresolvedNested.slice(0, 25).join(', ')}${unresolvedNested.length > 25 ? ', …' : ''}`);
    }
}

// ── Evidence coverage (port of floor-check 416-426). ──
const parseEntries = (p) => { const j = p && existsSync(p) ? readJSON(p) : null; return (j && (j.Entries ?? j.entries)) || []; };
const evidenceTargets = [...parseEntries(provenanceFile), ...parseEntries(codeEvidenceFile)]
    .map((e) => String((e && e.TargetField) || '').toLowerCase())
    .filter(Boolean);
const fieldEvidenced = (field) => { const needle = '.' + String(field).toLowerCase(); return evidenceTargets.some((t) => t.endsWith(needle)); };

const isPresent = (v) => !(v === null || v === undefined || (typeof v === 'string' && v.trim().length === 0));
const anyIOFTrue = (field) => allIOFRows.some((r) => r && r.fields && r.fields[field] === true);
const anyIOFSet = (field) => allIOFRows.some((r) => r && r.fields && isPresent(r.fields[field]));
const isFixedValueSlot = (slot) => slot && Object.prototype.hasOwnProperty.call(slot, 'fixedValue');

// ── Per-slot value-presence + evidence loop (port of floor-check 440-516). ──
for (const slot of slots) {
    const slotId = slot?.id ?? '(unnamed)';
    const nullable = slot?.nullable === true;
    const dot = slotId.indexOf('.');
    const family = dot >= 0 ? slotId.slice(0, dot) : slotId;
    const field = dot >= 0 ? slotId.slice(dot + 1) : '';

    if (isFixedValueSlot(slot)) { out.filled += 1; out.verified += 1; continue; }

    if (family === 'MetadataFile') { out.filled += 1; out.verified += 1; continue; } // rootPresent already true here

    if (family === 'Connector') {
        if (buildClean && connectorFileExists) { out.filled += 1; out.verified += 1; }
        else if (!nullable) fail('slot-not-filled', slotId, 'connector did not build clean / file missing — method body unproven');
        else out.nullableSkipped += 1;
        continue;
    }

    let values;
    if (family === 'Integration') {
        values = [integrationFields[field]];
    } else if (family === 'IntegrationObject') {
        if (ioRows.length === 0) { fail('slot-not-filled', slotId, 'metadata file has zero Integration Object rows'); continue; }
        values = ioRows.map((io) => (io && io.fields) ? io.fields[field] : undefined);
    } else if (family === 'IntegrationObjectField') {
        if (allIOFRows.length === 0) { fail('slot-not-filled', slotId, 'metadata file has zero Integration Object Field rows'); continue; }
        values = allIOFRows.map((r) => (r && r.fields) ? r.fields[field] : undefined);
    } else {
        continue;
    }

    const presentCount = values.filter(isPresent).length;
    const allPresent = presentCount === values.length;

    if (!nullable) {
        if (allPresent) { out.filled += 1; }
        else { fail('unprovable-required', slotId, `value missing on ${values.length - presentCount}/${values.length} row(s) for a non-nullable slot`); continue; }
    } else {
        if (presentCount > 0) out.filled += 1; else { out.nullableSkipped += 1; continue; }
    }

    let needsEvidence = false;
    if (slotId === 'Integration.CredentialTypeID') needsEvidence = true;
    else if (slotId === 'IntegrationObjectField.IsPrimaryKey') needsEvidence = anyIOFTrue('IsPrimaryKey');
    else if (slotId === 'IntegrationObjectField.RelatedIntegrationObjectID') needsEvidence = anyIOFSet('RelatedIntegrationObjectID');

    if (needsEvidence && !fieldEvidenced(field)) {
        fail('slot-not-verified', slotId, `dangerous constraint asserted without source evidence (no PROVENANCE/CODE_EVIDENCE TargetField ending in .${field})`);
    } else {
        out.verified += 1;
    }
}

// Compact facts the floor-check's DOWNSTREAM checks (scope-thin, fields-thin, HybridE2E coverage,
// reality-probe-empty) need from the parsed metadata — a SLIM per-IO summary (structural fields only,
// no Descriptions) small enough to round-trip, plus the Integration root's structural fields. This lets
// those checks run correctly under the large-catalog fallback instead of seeing empty ioRows/allIOFRows.
out.ios = ioRows.map((io) => {
    const f = (io && io.fields) || {};
    return { fields: {
        Name: f.Name, Status: f.Status, APIPath: f.APIPath,
        CreateAPIPath: f.CreateAPIPath, UpdateAPIPath: f.UpdateAPIPath, DeleteAPIPath: f.DeleteAPIPath,
        SupportsCreate: f.SupportsCreate, SupportsUpdate: f.SupportsUpdate, SupportsDelete: f.SupportsDelete,
    } };
});
out.integrationFields = { Name: integrationFields.Name, ImportPath: integrationFields.ImportPath, CredentialTypeID: integrationFields.CredentialTypeID };

console.log(JSON.stringify(out));
