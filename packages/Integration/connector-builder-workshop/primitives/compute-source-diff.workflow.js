// LOCKED PRIMITIVE — compute-source-diff
//
// Guarantee: completeness is computed, not judged. No LLM in the comparison path.
// Universe is the canonical list of items derivable from the source (OpenAPI paths,
// HTML nav tree leaves, describe enumeration); extracted is what the run actually
// produced. The diff is set-arithmetic, full stop.
//
// Inputs:
//   { universe: string[], extracted: string[] }
//
// Output:
//   { missing: string[], orphan: string[], universeCount: number, extractedCount: number }

export const meta = {
    name: 'compute-source-diff',
    description: 'Set-arithmetic completeness check. Deterministic; no LLM in the comparison.',
    phases: [{ title: 'diff', detail: 'Deterministic set-difference both directions' }],
};

phase('diff');

const universe = Array.isArray(args?.universe) ? args.universe : [];
const extracted = Array.isArray(args?.extracted) ? args.extracted : [];

// Still deterministic set-arithmetic (NO LLM), but the comparison key is NORMALIZED so trivial
// authored-name form differences (case, spaces/punctuation/underscores, singular↔plural, a trailing
// parenthetical qualifier like "Attendee (Order Attendees)") don't register as false "missing"/orphan.
// Exact-string matching between an agent-authored TaxonomyLeaves list and the emitted IO display names
// produced 30-of-31 false gaps on Eventbrite though every object was covered. Normalization only makes
// the diff MORE lenient about form — a genuinely absent object still has no normalized match and stays
// missing — so it removes false positives without masking real coverage gaps. Original names are
// reported; the normalized key is only the match basis.
const baseKey = (s) => String(s)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')          // drop parenthetical qualifiers
    .replace(/[^a-z0-9]+/g, '');         // strip spaces/punctuation/underscores
// Candidate keys per name — the base form plus its singular/plural variants. English pluralization
// has no single-regex inverse (attendees→attendee strips 's'; classes→class strips 'es';
// categories→category is 'ies'→'y'), so we emit ALL plausible forms and match if two names share ANY.
// Two names match iff their candidate-sets intersect — lenient enough that trivial form differences
// (case, punctuation, singular↔plural, a parenthetical qualifier) never register as a false gap, yet a
// genuinely-absent object still shares no candidate and stays missing. Deterministic; no LLM.
const candidates = (s) => {
    const k = baseKey(s);
    const set = new Set([k]);
    if (k.endsWith('ies')) set.add(k.slice(0, -3) + 'y');
    if (k.endsWith('es')) set.add(k.slice(0, -2));
    if (k.endsWith('s')) set.add(k.slice(0, -1));
    set.add(k + 's');
    return set;
};
const intersects = (a, b) => { for (const x of a) if (b.has(x)) return true; return false; };
const extractedCand = [...new Set(extracted.map(String))].map((x) => ({ name: x, keys: candidates(x) }));
const universeItems = [...new Set(universe.map(String))].map((x) => ({ name: x, keys: candidates(x) }));

const missing = universeItems.filter((u) => !extractedCand.some((e) => intersects(u.keys, e.keys))).map((u) => u.name).sort();
const orphan = extractedCand.filter((e) => !universeItems.some((u) => intersects(u.keys, e.keys))).map((e) => e.name).sort();

log(`compute-source-diff: universe=${universeItems.length}, extracted=${extractedCand.length}, missing=${missing.length}, orphan=${orphan.length} (candidate-key match)`);

return {
    missing,
    orphan,
    universeCount: universeItems.length,
    extractedCount: extractedCand.length,
};
