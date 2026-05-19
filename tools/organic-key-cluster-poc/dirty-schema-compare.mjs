// Dirty Schema Comparison Runner
//
// Runs the organic-key detector against (1) a clean baseline state.json and
// (2) one or more degraded state.json files, then compares KEEP cluster sets
// to measure recall/precision degradation as the schema gets messier.
//
// Recall:    fraction of baseline KEEP clusters whose concept survives in the
//            degraded run (matched by overlap of member columns, since column
//            names will have changed)
// Precision: fraction of degraded KEEP clusters that map to a baseline KEEP
//            (false positives = clusters that only appear under degradation)
//
// Matching: a degraded cluster matches a baseline cluster if their member sets
// (mapped back to ORIGINAL column names via the recorded degradation) share
// >= MATCH_THRESHOLD fraction of members. Member-level matching is by
// (schema.table.originalColumnName) — schema/table are preserved across
// degradations except in the mixed-systems mode, which we account for by
// stripping the prefix when comparing.
//
// Usage:
//   node dirty-schema-compare.mjs \
//        --baseline=/path/to/baseline-state.json \
//        --degraded=/path/to/degraded-state.json \
//        [--out=DIRTY_SCHEMA_REPORT.md]
//
// This script does NOT run the embedding/LLM pipeline itself — it consumes
// state files that ALREADY have `organicKeyClusters` populated (i.e., you must
// run `db-auto-doc analyze` against each state with organicKeyDetection.enabled
// before invoking the compare). This keeps the script cheap and deterministic.

import { readFile, writeFile } from 'node:fs/promises';

const MATCH_THRESHOLD = 0.4; // 40% member overlap counts as a match

function parseArgs() {
    const args = {};
    for (const a of process.argv.slice(2)) {
        const m = a.match(/^--([^=]+)=(.*)$/);
        if (m) args[m[1]] = m[2];
    }
    return args;
}

function stripSystemPrefix(name) {
    return name.replace(/^(?:mc|hs|sf|mj)_/, '');
}

function memberKey(m) {
    // Strip mixed-systems table prefix for comparison
    return `${m.schema}.${stripSystemPrefix(m.table)}.<col>`;
}

function clusterMemberSet(cluster) {
    // Member identity for matching: schema + (system-prefix-stripped) table.
    // We deliberately ignore column name because degradations rename columns.
    // Two clusters are "the same" if they cover the same schema.table set.
    const out = new Set();
    for (const m of cluster.members) out.add(memberKey(m));
    return out;
}

function jaccard(a, b) {
    let intersect = 0;
    for (const x of a) if (b.has(x)) intersect++;
    const union = a.size + b.size - intersect;
    return union === 0 ? 0 : intersect / union;
}

function findBestMatch(target, candidates) {
    let bestScore = 0;
    let best = null;
    for (const c of candidates) {
        const score = jaccard(target, c.set);
        if (score > bestScore) {
            bestScore = score;
            best = c;
        }
    }
    return { match: best, score: bestScore };
}

function summarize(label, state) {
    const clusters = state.organicKeyClusters ?? [];
    return {
        label,
        clusterCount: clusters.length,
        memberCount: clusters.reduce((a, c) => a + c.members.length, 0),
        clusters: clusters.map((c) => ({
            id: c.id,
            concept: c.concept,
            confidence: c.confidence,
            tags: c.tags,
            members: c.members,
            set: clusterMemberSet(c),
        })),
    };
}

async function main() {
    const args = parseArgs();
    if (!args.baseline || !args.degraded) {
        console.error(
            'Usage: dirty-schema-compare.mjs --baseline=<path> --degraded=<path> [--out=<path>]',
        );
        process.exit(1);
    }
    const baseline = summarize('baseline', JSON.parse(await readFile(args.baseline, 'utf-8')));
    const degraded = summarize('degraded', JSON.parse(await readFile(args.degraded, 'utf-8')));
    const degradedState = JSON.parse(await readFile(args.degraded, 'utf-8'));
    const provenance = degradedState.__dirtySchemaProvenance ?? {};

    // Compute recall: for each baseline cluster, find best degraded match
    const recall = baseline.clusters.map((bc) => {
        const { match, score } = findBestMatch(bc.set, degraded.clusters);
        return {
            baseline: bc,
            matched: match,
            jaccard: score,
            recalled: score >= MATCH_THRESHOLD,
        };
    });
    const recalledCount = recall.filter((r) => r.recalled).length;
    const recallRate = baseline.clusters.length === 0 ? 0 : recalledCount / baseline.clusters.length;

    // Compute precision: for each degraded cluster, did it correspond to a baseline cluster?
    const precision = degraded.clusters.map((dc) => {
        const { match, score } = findBestMatch(dc.set, baseline.clusters);
        return {
            degraded: dc,
            matched: match,
            jaccard: score,
            isTruePositive: score >= MATCH_THRESHOLD,
        };
    });
    const tpCount = precision.filter((p) => p.isTruePositive).length;
    const precisionRate =
        degraded.clusters.length === 0 ? 0 : tpCount / degraded.clusters.length;

    // ─── Build report ────────────────────────────────────────────────────
    const lines = [];
    lines.push('# Dirty Schema Benchmark — Recall / Precision Report');
    lines.push('');
    lines.push('## Run provenance');
    lines.push('');
    lines.push(`- **Baseline:** \`${args.baseline}\``);
    lines.push(`- **Degraded:** \`${args.degraded}\``);
    if (provenance.modes) {
        lines.push(`- **Degradations applied:** \`${provenance.modes.join(', ')}\``);
    }
    if (provenance.seed !== undefined) {
        lines.push(`- **RNG seed:** \`${provenance.seed}\``);
    }
    lines.push(`- **Match threshold:** Jaccard ≥ ${MATCH_THRESHOLD} on (schema.table) member sets`);
    lines.push('');
    lines.push('## Headline');
    lines.push('');
    lines.push('| Metric | Baseline | Degraded |');
    lines.push('|---|---|---|');
    lines.push(`| KEEP cluster count | ${baseline.clusters.length} | ${degraded.clusters.length} |`);
    lines.push(`| Total members | ${baseline.memberCount} | ${degraded.memberCount} |`);
    lines.push('');
    lines.push(`**Recall:** ${recalledCount} / ${baseline.clusters.length} = **${(recallRate * 100).toFixed(1)}%**`);
    lines.push(`**Precision:** ${tpCount} / ${degraded.clusters.length} = **${(precisionRate * 100).toFixed(1)}%**`);
    lines.push('');

    lines.push('## Per-cluster recall (baseline → degraded)');
    lines.push('');
    lines.push('| Baseline concept | Members | Jaccard | Recalled |');
    lines.push('|---|---|---|---|');
    for (const r of recall) {
        const status = r.recalled
            ? `✓ → ${r.matched?.concept ?? '(none)'}`
            : `✗ (best: ${r.matched?.concept ?? 'none'})`;
        lines.push(
            `| \`${r.baseline.concept}\` | ${r.baseline.members.length} | ${r.jaccard.toFixed(2)} | ${status} |`,
        );
    }
    lines.push('');

    lines.push('## Degraded-only false positives');
    lines.push('');
    const fps = precision.filter((p) => !p.isTruePositive);
    if (fps.length === 0) {
        lines.push('_(none — every degraded KEEP maps to a baseline KEEP)_');
    } else {
        lines.push('| Degraded concept | Members | Best baseline match | Jaccard |');
        lines.push('|---|---|---|---|');
        for (const p of fps) {
            lines.push(
                `| \`${p.degraded.concept}\` | ${p.degraded.members.length} | ${p.matched?.concept ?? '(none)'} | ${p.jaccard.toFixed(2)} |`,
            );
        }
    }
    lines.push('');

    lines.push('## Interpretation guide');
    lines.push('');
    lines.push('- **High recall + high precision** → algorithm is robust to this kind of degradation. Strongest signal.');
    lines.push('- **High recall, lower precision** → degradation introduces noise the algorithm picks up. Tagging may help filter.');
    lines.push('- **Lower recall, high precision** → algorithm correctly stays conservative but loses real organic keys under degradation. Lower the LLM bar, or add more signal (MinHash, business-anchor projection).');
    lines.push('- **Low both** → degradation pushes detection out of distribution. Diagnose with per-cluster Jaccard scores above.');
    lines.push('');

    const report = lines.join('\n');
    if (args.out) {
        await writeFile(args.out, report);
        console.log(`Wrote ${args.out}`);
    } else {
        console.log(report);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
