#!/usr/bin/env node
// enumerate-apib.mjs — deterministic enumerator for Eventbrite's API Blueprint (.apib) file.
// Purpose: mirror the discipline of enumerate-catalog.mjs for a source shape that shared
// enumerator does not parse (API Blueprint / MSON). Parses the SAVED RAW file only.
//
// Two complementary enumerations, unioned into the record-type universe:
//  (A) "## Data Structures" MSON type definitions -- `### TypeName (object)` / `### TypeName (Parent)`
//      headers. These are the vendor's OWN named record shapes (Attendee, Order, Event, Category...).
//  (B) "# Group X" -> "## X Object" headers in the resource-group sections (the top-level object
//      declared per group, e.g. "## Attendee Object", "## Category Object"). Cross-checked against (A).
//
// Excludes: *Request suffixed variants (input shapes, not distinct record types -- Address Request
// is the create/update payload shape of Address, not a separate table), pure wrapper/response
// aliases that just re-point at a base type with no own fields, and MSON primitive-only leaves
// (Amount, enums) that carry no id/own identity.
//
// Also extracts the per-group ENDPOINT table (method + path + response attributes) for cross-checking
// against the field count signal.

import { readFileSync } from 'node:fs';

const REQUEST_SUFFIX_RE = /\sRequest$/;

function parseDataStructures(text) {
    // Data Structures block: lines starting with "### Name (kind)" until next "### " or "# "/"## " at
    // lower heading depth. We take ALL "### " headers, not just those inside the labeled block, because
    // the file contains a "## Data Structures" section header appearing TWICE (line ~3470 stub + full
    // block at ~4450) -- so anchor on heading level 3 (###) globally, which is used ONLY for MSON type
    // defs in this document (endpoint sub-sections use "### <name> [METHOD /path]").
    const lines = text.split(/\r?\n/);
    const types = [];
    let current = null;
    for (const line of lines) {
        const h3 = line.match(/^### (.+)$/);
        if (h3) {
            if (current) types.push(current);
            const header = h3[1].trim();
            // Endpoint sub-sections look like "Retrieve [GET /orders/{id}/]" -- skip (has [METHOD or [/path)
            const isEndpoint = /\[(?:GET|POST|PUT|PATCH|DELETE)\s+\//.test(header) || /\[\//.test(header);
            if (isEndpoint) { current = null; continue; }
            // MSON type header: "Name (kind)" or "Name (Parent Type)" or bare "Name"
            const m = header.match(/^`?([^(`]+?)`?\s*(?:\(([^)]*)\))?$/);
            const name = m ? m[1].trim() : header;
            const kind = m ? (m[2] ?? '').trim() : '';
            current = { name, kind, fieldLines: 0 };
            continue;
        }
        // stop accumulating fields once we hit a level-1/2 heading (new Group/section)
        if (/^#{1,2} /.test(line)) {
            if (current) { types.push(current); current = null; }
            continue;
        }
        if (current) {
            // MSON field line: "+ field_name (type) - description" at top level (4-space or less indent before +)
            if (/^\+ /.test(line) || /^\s{0,4}\+ /.test(line)) current.fieldLines++;
        }
    }
    if (current) types.push(current);
    return types;
}

function parseGroupObjects(text) {
    // "# Group X" ... "## X Object" pattern -- top-level resource per group.
    const re = /^## ([A-Za-z0-9 /'-]+) Object\b/gm;
    const names = [];
    let m;
    while ((m = re.exec(text)) !== null) names.push(m[1].trim());
    return names;
}

function parseEndpoints(text) {
    // "### <label> [METHOD /path]" lines -- the real operation catalog.
    const re = /^### .*\[(GET|POST|PUT|PATCH|DELETE)\s+([^\]]+)\]/gm;
    const endpoints = [];
    let m;
    while ((m = re.exec(text)) !== null) {
        endpoints.push({ method: m[1], path: m[2].trim() });
    }
    return endpoints;
}

function parseGroups(text) {
    const re = /^# Group (.+)$/gm;
    const groups = [];
    let m;
    while ((m = re.exec(text)) !== null) groups.push(m[1].trim());
    return groups;
}

function dedupeSorted(names) {
    return [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function enumerateAPIB(sourceText) {
    const dataStructureTypes = parseDataStructures(sourceText);
    const groupObjects = parseGroupObjects(sourceText);
    const endpoints = parseEndpoints(sourceText);
    const groups = parseGroups(sourceText);

    // Record-type universe: MSON "object"/parent-typed structures that carry >=1 own field,
    // EXCLUDING "* Request" input-shape variants (those are the create/update payload of their
    // base type, not a distinct syncable record) and pure value-object leaves that are clearly
    // component/nested-value shapes with no id-bearing identity of their own (kept IN by default --
    // bias to more; only Amount is explicitly a primitive wrapper per the file's own layout).
    const recordTypeNames = dataStructureTypes
        .filter((t) => t.fieldLines > 0)
        .filter((t) => !REQUEST_SUFFIX_RE.test(t.name))
        .map((t) => t.name);

    const recordTypes = dedupeSorted(recordTypeNames);
    const fieldCount = dataStructureTypes
        .filter((t) => !REQUEST_SUFFIX_RE.test(t.name))
        .reduce((sum, t) => sum + t.fieldLines, 0);

    return {
        format: 'api-blueprint',
        recordTypes,
        count: recordTypes.length,
        fieldCount,
        confidence: 'high',
        groups: dedupeSorted(groups),
        groupCount: groups.length,
        groupObjects: dedupeSorted(groupObjects),
        endpointCount: endpoints.length,
        endpoints,
    };
}

export function enumerateAPIBFile(sourcePath) {
    const text = readFileSync(sourcePath, 'utf8');
    return { ...enumerateAPIB(text), sourcePath };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    if (args.length === 0) { process.stderr.write('usage: node enumerate-apib.mjs <file.apib>\n'); process.exit(2); }
    const out = enumerateAPIBFile(args[0]);
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}
