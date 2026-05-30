// LOCKED PRIMITIVE — loop-until-dry
//
// Guarantee: exit is structural — K consecutive empty rounds. Producer cannot
// declare "done" prematurely. K is supplied by caller and is bounded below by
// the planner manifest (typically K=2 for normal docs, K=3 for sparse).
//
// Inputs:
//   {
//     finders: Array<{label: string, prompt: string, schema: object}>,  // per-round finder set
//     K: number,                                                         // consecutive-empty-rounds threshold
//     maxRounds?: number,                                                // hard cap (budget safety)
//     itemKey: (item: any) => string,                                    // dedup key extractor
//     seedFound?: string[],                                              // already-seen items
//   }
//
// Output:
//   { accumulated: any[], rounds: number, dry: boolean, hitMaxRounds: boolean }

export const meta = {
    name: 'loop-until-dry',
    description: 'Repeats parallel finder rounds until K consecutive rounds return zero new items. K and maxRounds supplied by caller; producer cannot declare done.',
    phases: [{ title: 'rounds', detail: 'Run finder rounds until dry-threshold met or hit cap' }],
};

phase('rounds');

const K = Math.max(1, Number(args?.K ?? 2));
const maxRounds = Math.max(K + 1, Number(args?.maxRounds ?? 12));
const finders = Array.isArray(args?.finders) ? args.finders : [];
const seen = new Set((args?.seedFound ?? []).map(String));
const accumulated = [];
let consecutiveDry = 0;
let round = 0;

while (consecutiveDry < K && round < maxRounds) {
    round++;
    const found = (await parallel(
        finders.map(f => () =>
            agent(`Round ${round} — ${f.prompt}\n\nAlready seen (do not re-emit): ${[...seen].slice(0, 100).join(', ')}${seen.size > 100 ? ` (+${seen.size - 100} more)` : ''}`,
                { schema: f.schema, phase: 'rounds', label: `${f.label}:r${round}` })
        )
    )).filter(Boolean);

    // Each finder returns { items: any[] } per its schema.  Collect items across finders.
    const newItems = found.flatMap(r => Array.isArray(r?.items) ? r.items : []);
    const fresh = [];
    for (const item of newItems) {
        const key = String(item?.key ?? item?.id ?? item?.name ?? JSON.stringify(item));
        if (!seen.has(key)) {
            seen.add(key);
            fresh.push(item);
        }
    }

    if (fresh.length === 0) {
        consecutiveDry++;
        log(`round ${round}: dry (${consecutiveDry}/${K} consecutive)`);
    } else {
        consecutiveDry = 0;
        accumulated.push(...fresh);
        log(`round ${round}: +${fresh.length} new items (total ${accumulated.length})`);
    }
}

return {
    accumulated,
    rounds: round,
    dry: consecutiveDry >= K,
    hitMaxRounds: round >= maxRounds && consecutiveDry < K,
};
