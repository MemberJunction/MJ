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
const universeSet = new Set(universe.map(String));
const extractedSet = new Set(extracted.map(String));

const missing = [...universeSet].filter(x => !extractedSet.has(x)).sort();
const orphan = [...extractedSet].filter(x => !universeSet.has(x)).sort();

log(`compute-source-diff: universe=${universeSet.size}, extracted=${extractedSet.size}, missing=${missing.length}, orphan=${orphan.length}`);

return {
    missing,
    orphan,
    universeCount: universeSet.size,
    extractedCount: extractedSet.size,
};
