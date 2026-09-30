#!/usr/bin/env node
/**
 * check-ai-model-ranks.mjs
 *
 * Within a model's version lineage, a later model must not rank below the model it succeeds.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────────
 * Prompts with a rank-based SelectionStrategy (Default, ByPower) and agents choose models by
 * AIModel.PowerRank, not by a fixed list. When a newer model ranks below its predecessor, those
 * callers keep preferring the older one — which is also the one closest to upstream retirement.
 * MJ#4912 found twelve such inversions in metadata/ai-models (GPT 5.5 below GPT 5.4, Claude
 * Sonnet 5 below Sonnet 4.6, Grok 4.3 below Grok 4.20, ...). Nothing caught them because the
 * catalog pushes cleanly either way.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────────
 * The lineage is AIModel.PriorVersionID — the schema's own "previous version of this model"
 * field — so no model names are parsed. For every model whose PriorVersionID is set:
 *   1. the PriorVersionID must resolve to a model in the catalog; and
 *   2. when both models are active, share an AIModelTypeID and both carry a PowerRank,
 *      PowerRank(model) >= PowerRank(prior).
 * An inactive model on either side is exempt: rank-based selection never picks it. SpeedRank
 * and CostRank are not checked — a newer model can legitimately be slower or cheaper.
 *
 * A tie passes, but it is not a preference for the newer model: rank-based selection sorts on
 * PowerRank alone, so tied models come back in whatever order the catalog loaded. Tie only
 * when the two really are equals (an alias of the same API model, or a sibling that
 * complements rather than replaces); otherwise rank the newer one higher.
 *
 * PriorVersionID means "the previous version", not "the family's flagship". A tier variant
 * (a Flash, a Turbo, an Edit model) whose own earlier version is not in the catalog should
 * leave it null rather than point at the main model it is cheaper than.
 *
 * Usage (from any directory):
 *   node check-ai-model-ranks.mjs          # metadata/ai-models of this repository
 *   node check-ai-model-ranks.mjs <dir>    # another directory of AI model metadata files
 */
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';

const RED = '\x1b[0;31m', YELLOW = '\x1b[0;33m', GREEN = '\x1b[0;32m', NC = '\x1b[0m';
const DEFAULT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'metadata', 'ai-models');
const NAME_LOOKUP_PREFIX = '@lookup:MJ: AI Models.Name=';

/**
 * Every AI model record in a metadata directory tree: the dot-prefixed record files MetadataSync
 * reads (`**\/.*.json`, recursively), minus its own `.mj-sync.json` config and `.backups`.
 * `file` is the path relative to `dir`.
 */
export function loadModels(dir) {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((d) => d.isFile() && d.name.startsWith('.') && d.name.endsWith('.json') && d.name !== '.mj-sync.json')
        .map((d) => relative(dir, join(d.parentPath, d.name)))
        .filter((rel) => !rel.split(sep).includes('.backups'))
        .sort()
        .flatMap((rel) => {
            const parsed = JSON.parse(readFileSync(join(dir, rel), 'utf8'));
            return (Array.isArray(parsed) ? parsed : [parsed]).map((record) => ({ file: rel, record }));
        });
}

/**
 * Resolve a PriorVersionID — either a Name lookup or a raw UUID — to a catalog entry. Name
 * lookups match case-insensitively, as MetadataSync resolves them.
 * @returns the entry, or null when nothing matches
 */
function resolvePrior(ref, byName, byId) {
    if (typeof ref !== 'string') return null;
    if (ref.startsWith(NAME_LOOKUP_PREFIX)) return byName.get(ref.slice(NAME_LOOKUP_PREFIX.length).trim().toLowerCase()) ?? null;
    return byId.get(ref.toUpperCase()) ?? null;
}

/**
 * @param {{ file: string, record: { fields: Record<string, unknown>, primaryKey?: { ID?: string } } }[]} models
 * @returns {{ unresolved: { file: string, name: string, prior: string }[],
 *             inversions: { file: string, name: string, rank: number, prior: string, priorRank: number }[] }}
 */
export function findRankViolations(models) {
    const byName = new Map(models.map((m) => [String(m.record.fields.Name).trim().toLowerCase(), m]));
    const byId = new Map(models.filter((m) => m.record.primaryKey?.ID).map((m) => [m.record.primaryKey.ID.toUpperCase(), m]));
    const unresolved = [], inversions = [];
    for (const m of models) {
        const f = m.record.fields;
        if (f.PriorVersionID === undefined || f.PriorVersionID === null) continue;
        const prior = resolvePrior(f.PriorVersionID, byName, byId);
        if (!prior) {
            unresolved.push({ file: m.file, name: f.Name, prior: String(f.PriorVersionID) });
            continue;
        }
        const p = prior.record.fields;
        const comparable = f.IsActive === true && p.IsActive === true
            && f.AIModelTypeID === p.AIModelTypeID
            && typeof f.PowerRank === 'number' && typeof p.PowerRank === 'number';
        if (comparable && f.PowerRank < p.PowerRank) {
            inversions.push({ file: m.file, name: f.Name, rank: f.PowerRank, prior: p.Name, priorRank: p.PowerRank });
        }
    }
    return { unresolved, inversions };
}

const REMEDIATION = `
${RED}AI model ranks out of lineage order${NC}

A model ranks below the model its PriorVersionID names, so rank-based model selection
(prompts with SelectionStrategy Default/ByPower, and agents) prefers the older model.
Fix the PowerRank that is wrong — usually the newer model's, but check the older one
against published capability before raising a whole family to match an outlier.

If the PriorVersionID points at a different tier (a Flash or Turbo variant pointing at
the main model), it is the link that is wrong: point it at the variant's own previous
version, or set it to null when the catalog has none.

Background: MJ#4912.`;

function main(argv) {
    const dir = argv[0] ? resolve(argv[0]) : DEFAULT_DIR;
    const models = loadModels(dir);
    const { unresolved, inversions } = findRankViolations(models);
    for (const u of unresolved) {
        console.log(`${RED}✗ ${u.file}${NC}: ${u.name} — PriorVersionID ${YELLOW}${u.prior}${NC} matches no model`);
    }
    for (const i of inversions) {
        console.log(`${RED}✗ ${i.file}${NC}: ${i.name} (PowerRank ${i.rank}) ranks below its prior version ${i.prior} (PowerRank ${i.priorRank})`);
    }
    if (unresolved.length + inversions.length > 0) {
        console.log(REMEDIATION);
        return 1;
    }
    const linked = models.filter((m) => m.record.fields.PriorVersionID != null).length;
    console.log(`${GREEN}✓ ${linked} model lineage links checked across ${models.length} models; no rank inversions${NC}`);
    return 0;
}

/** True when this module is the process entry point, comparing real paths so a symlinked checkout still runs. */
function isEntryPoint() {
    if (!process.argv[1]) return false;
    try {
        return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
    } catch {
        return false;
    }
}

if (isEntryPoint()) {
    process.exit(main(process.argv.slice(2)));
}
