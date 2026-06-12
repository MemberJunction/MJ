#!/usr/bin/env node
// parse-sdl-fk.mjs
// Parses the SpectaQL SDL HTML, extracts each object type's field -> unwrapped type map,
// and computes FK edges for every emitted IO field whose type (or <Type>Id scalar name)
// resolves to another EMITTED IO. Outputs JSON describing the proposed FK edges.
//
// FK rule (Tier-1 structural, per amendment):
//   (1) typed reference: a field whose unwrapped (list-or-not) type == an emitted IO name
//   (2) scalar <Type>Id: a field named "<emittedIO>Id" (case-insensitive) whose type is a scalar
//       (Int/String/ID/etc) AND <emittedIO> is an emitted IO.
// Contradiction check: skip if the field description says it is the same as / an alias of id.
// PK exemption: a field that is the IO's own PK is NOT turned into an FK to itself.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const SDL = path.join(ROOT, 'packages/Integration/connectors-registry/path-lms/sources/schema.spectaql.html');
const META = path.join(ROOT, 'metadata/integrations/path-lms/.path-lms.integration.json');

const html = fs.readFileSync(SDL, 'utf8');
const meta = JSON.parse(fs.readFileSync(META, 'utf8'))[0];
const ios = meta.relatedEntities['MJ: Integration Objects'];
const emitted = new Set(ios.map((io) => io.fields.Name));

// --- Parse SDL: each definition-object block -> [{ field, rawType, baseType, description }]
function sliceDefinitions() {
  const blocks = {};
  const re = /id="definition-([A-Za-z0-9]+)" class="definition definition-object"/g;
  let m;
  const starts = [];
  while ((m = re.exec(html))) starts.push({ name: m[1], idx: m.index });
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].idx;
    const end = i + 1 < starts.length ? starts[i + 1].idx : html.length;
    blocks[starts[i].name] = html.slice(start, end);
  }
  return blocks;
}

// Within a block, each field row:
//  <span class="property-name"><code>FIELD</code></span> - <span class="property-type"><a href="#definition-TYPE"><code>TYPE!</code></a></span>
//  ... </td> <td> DESCRIPTION </td>
function parseFields(block) {
  const out = [];
  const rowRe = /<span class="property-name"><code>([^<]+)<\/code><\/span>\s*-\s*<span class="property-type">(.*?)<\/span>\s*<\/td>\s*<td>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = rowRe.exec(block))) {
    const field = m[1].trim();
    const typeHtml = m[2];
    const desc = m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    // base type = the #definition-XXX anchor target
    const tm = typeHtml.match(/#definition-([A-Za-z0-9]+)/);
    const baseType = tm ? tm[1] : null;
    // raw rendered type label (e.g. "[CourseItem]!" or "Int")
    const rm = typeHtml.match(/<code>([^<]+)<\/code>/);
    const rawType = rm ? rm[1].trim() : '';
    const isList = /\[/.test(rawType);
    out.push({ field, rawType, baseType, isList, description: desc });
  }
  return out;
}

const blocks = sliceDefinitions();
const typeFields = {}; // typeName -> field defs
for (const [name, block] of Object.entries(blocks)) {
  typeFields[name] = parseFields(block);
}

// Contradiction: description indicates self-alias of id
function isSelfAlias(desc) {
  const d = desc.toLowerCase();
  return /same as (the )?id\b/.test(d) || /alias of (the )?id\b/.test(d) || /for cross.?referencing/.test(d);
}

// Build per-IO PK field set from metadata (to avoid self-FK)
const pkByIO = {};
for (const io of ios) {
  const name = io.fields.Name;
  const iofs = (io.relatedEntities && io.relatedEntities['MJ: Integration Object Fields']) || [];
  pkByIO[name] = new Set(iofs.filter((f) => f.fields.IsPrimaryKey).map((f) => f.fields.Name));
}

// For each emitted IO, for each metadata IOF, decide FK
const SCALARS = new Set(['Int', 'String', 'ID', 'Boolean', 'Float', 'Date', 'DateTime', 'JSON', 'Currency']);
const edges = []; // { io, field, target, kind, baseType, rawType, description }
const unresolved = []; // typed reference to a NON-emitted type
const targetCounts = {};

for (const io of ios) {
  const ioName = io.fields.Name;
  const sdlFields = typeFields[ioName] || [];
  const sdlByName = new Map(sdlFields.map((f) => [f.field, f]));
  const iofs = (io.relatedEntities && io.relatedEntities['MJ: Integration Object Fields']) || [];
  for (const iof of iofs) {
    const fname = iof.fields.Name;
    if (pkByIO[ioName].has(fname)) continue; // never self-FK on own PK
    const sf = sdlByName.get(fname);
    if (!sf) continue; // field not in SDL (shouldn't happen for emitted)
    const desc = sf.description || '';
    if (isSelfAlias(desc)) continue; // contradiction check

    // (1) typed reference: baseType is an object type
    if (sf.baseType && !SCALARS.has(sf.baseType)) {
      if (emitted.has(sf.baseType) && sf.baseType !== ioName) {
        edges.push({ io: ioName, field: fname, target: sf.baseType, kind: 'typed-reference', baseType: sf.baseType, rawType: sf.rawType, description: desc });
        targetCounts[sf.baseType] = (targetCounts[sf.baseType] || 0) + 1;
        continue;
      } else if (!emitted.has(sf.baseType)) {
        unresolved.push({ io: ioName, field: fname, baseType: sf.baseType, rawType: sf.rawType, reason: 'typed reference to NON-emitted type' });
        continue;
      } else {
        continue; // self reference to own type
      }
    }

    // (2) scalar <Type>Id pattern
    if (sf.baseType && SCALARS.has(sf.baseType) && /Id$/.test(fname) && fname.length > 2) {
      const stem = fname.slice(0, -2); // strip "Id"
      // candidate target: capitalize stem -> match an emitted IO
      const cand = stem.charAt(0).toUpperCase() + stem.slice(1);
      if (emitted.has(cand) && cand !== ioName) {
        edges.push({ io: ioName, field: fname, target: cand, kind: 'scalar-typeId', baseType: sf.baseType, rawType: sf.rawType, description: desc });
        targetCounts[cand] = (targetCounts[cand] || 0) + 1;
        continue;
      }
    }
  }
}

const report = {
  emittedIOs: emitted.size,
  totalEdges: edges.length,
  iosWithEdges: new Set(edges.map((e) => e.io)).size,
  targetCounts,
  unresolvedCount: unresolved.length,
  edges,
  unresolved,
};

fs.writeFileSync(path.join(ROOT, 'packages/Integration/connectors-registry/path-lms/scripts/fk-edges.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  emittedIOs: report.emittedIOs,
  totalEdges: report.totalEdges,
  iosWithEdges: report.iosWithEdges,
  unresolvedCount: report.unresolvedCount,
  byKind: edges.reduce((a, e) => ((a[e.kind] = (a[e.kind] || 0) + 1), a), {}),
}, null, 2));
