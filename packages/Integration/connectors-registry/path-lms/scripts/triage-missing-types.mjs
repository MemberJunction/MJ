#!/usr/bin/env node
// Deterministic triage (v2 P9) of the 9 types the completeness-diff found re-derivable-but-not-
// emitted. Pinned source: the PUBLIC SpectaQL HTML (live introspection is auth-gated). For each
// missing type: definition KIND (object vs interface/union — base types are not IOs), REACHABILITY
// from the Query doors (BFS over the field->type graph; "tables ≠ doors"), access path, field count.
// Verdict: amend (reachable object) | exclude-base (interface) | unreachable (named warning).
import fs from 'node:fs';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const REG = path.resolve(HERE, '..');                       // .../connectors-registry/path-lms
const REPO = path.resolve(REG, '../../../..');
const html = fs.readFileSync(path.join(REG, 'sources/schema.spectaql.html'), 'utf8');
const extracted = JSON.parse(fs.readFileSync(path.join(REPO, 'connectors-registry/path-lms/sources/schema_extracted.json'), 'utf8'));

const MISSING = ['BaseAccount', 'BaseTeam', 'CourseItemViewReport', 'SurveyQuestionAnswer', 'SurveySummativeInfo', 'UserPresentationReport', 'WebinarArchiveViewerReport', 'WebinarCancellationReport', 'WebinarGuestReport'];

// definition blocks + kinds
const blocks = {}; const kinds = {};
{
    const re = /id="definition-([A-Za-z0-9]+)" class="definition definition-([a-z]+)"/g;
    const starts = []; let m;
    while ((m = re.exec(html))) starts.push({ name: m[1], kind: m[2], idx: m.index });
    for (let i = 0; i < starts.length; i++) {
        const end = i + 1 < starts.length ? starts[i + 1].idx : html.length;
        blocks[starts[i].name] = html.slice(starts[i].idx, end);
        kinds[starts[i].name] = starts[i].kind;
    }
}
function edgesOf(block) {
    const out = []; let m;
    const rowRe = /<span class="property-name"><code>([^<]+)<\/code><\/span>\s*-\s*<span class="property-type">(.*?)<\/span>/g;
    while ((m = rowRe.exec(block))) {
        const tm = m[2].match(/#definition-([A-Za-z0-9]+)/);
        if (tm) out.push({ field: m[1].trim(), to: tm[1] });
    }
    return out;
}
const graph = {};
for (const [name, block] of Object.entries(blocks)) graph[name] = edgesOf(block);

// Doors: derived from the PINNED HTML itself (id="query-<name>" operation blocks; the response
// type is the first #definition-XXX link in the block). FAIL-LOUD on zero doors — a finder whose
// door-derivation failed must never emit plausible all-unreachable verdicts (P9).
const doors = [];
{
    const qre = /id="query-([A-Za-z0-9]+)" class="operation operation-query"/g;
    let qm;
    const seen = new Set();
    while ((qm = qre.exec(html))) {
        const q = qm[1];
        if (seen.has(q)) continue;
        seen.add(q);
        const block = html.slice(qm.index, qm.index + 8000);
        const rm = block.match(/#definition-([A-Za-z0-9]+)/);
        if (rm) doors.push({ query: q, returns: rm[1] });
    }
}
if (doors.length === 0) { console.error('FATAL: door derivation produced 0 doors — refusing to emit verdicts.'); process.exit(2); }

// BFS from door return types
const reach = new Map(); // type -> { via: door, path: [...] }
const queue = [];
for (const d of doors) { if (!reach.has(d.returns)) { reach.set(d.returns, { via: d.query, path: [d.returns] }); queue.push(d.returns); } }
while (queue.length) {
    const t = queue.shift();
    const info = reach.get(t);
    for (const e of (graph[t] || [])) {
        if (!reach.has(e.to)) { reach.set(e.to, { via: info.via, path: [...info.path, `${e.field}->${e.to}`] }); queue.push(e.to); }
    }
}

// interface implementors: types whose block mentions "implements ... BaseX" (spectaql renders it)
function implementors(iface) {
    const out = [];
    for (const [name, block] of Object.entries(blocks)) {
        if (name !== iface && new RegExp(`implements[\\s\\S]{0,200}#definition-${iface}"`).test(block.slice(0, 3000))) out.push(name);
    }
    return out;
}

const verdicts = MISSING.map((t) => {
    const kind = kinds[t] ?? 'absent-from-public-sdl';
    const fields = (graph[t] ?? []).length;
    const r = reach.get(t) ?? null;
    let verdict;
    if (kind === 'interface' || kind === 'union') verdict = 'exclude-base-type';
    else if (kind === 'absent-from-public-sdl') verdict = 'absent-from-public-sdl';
    else if (r) verdict = 'AMEND (reachable object)';
    else verdict = 'unreachable (named warning — no derivable access path)';
    return { type: t, kind, fieldEdges: fields, reachable: !!r, via: r?.via ?? null, path: r ? r.path.slice(-3) : null, implementors: (kind === 'interface') ? implementors(t).slice(0, 6) : undefined, verdict };
});
console.log(JSON.stringify({ doors: doors.length, typesInSdl: Object.keys(blocks).length, verdicts }, null, 2));
