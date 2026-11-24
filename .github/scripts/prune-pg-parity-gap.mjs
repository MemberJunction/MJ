#!/usr/bin/env node
/**
 * Finds the PostgreSQL PARITY GAP before the metadata push, and builds a copy of the metadata
 * that the PostgreSQL database can accept, so the integration suite still runs.
 *
 * A feature PR ships T-SQL migrations only; their PostgreSQL twins arrive later, in the build
 * engineer's /pg-migrate PR. Until then the PostgreSQL database built from migrations-pg lacks the
 * new entities, and `mj sync push` refuses any metadata that names them. Skipping the suite on that
 * gap would leave every other PR without PostgreSQL coverage, so instead this script removes only
 * what the gap makes impossible:
 *
 *   - a directory whose `.mj-sync.json` entity (or a `defaults` value) names a missing entity;
 *   - a record that names one: a `@lookup:<Entity>.` target, a `@lookup:MJ: Entities.Name=<Entity>`
 *     value, or a `relatedEntities` key. Prose that merely mentions the name (a Description) does not
 *     count, so an action whose description mentions a new entity is still pushed;
 *   - then, to a fixed point, a record whose `@lookup:<Entity>.Name=<Name>` points at a record removed
 *     above, since that lookup can no longer resolve.
 *
 * Everything else is pushed unchanged. A push of the pruned copy that still fails is a regression,
 * and the integration-postgres job fails on it.
 *
 * Modes (integration.yml's `pg` output):
 *   - `regressions`: a gap is reported as a warning; the pruned copy is written and the suite runs.
 *   - `gate`: the build engineer's PR, a dispatch, or a release. A gap fails (exit 1): closing it is
 *     that run's job, so nothing is pruned.
 *
 * Writes to $GITHUB_OUTPUT: `gap=true|false`, and the missing entities, one per line, to
 * --entities-out (the known-failures check reads it to attribute failures to the gap).
 *
 * Usage:
 *   node .github/scripts/prune-pg-parity-gap.mjs --mode=<regressions|gate> \
 *     --present=<file of entity names in the database, one per line> \
 *     --out=<dir for the pruned copies> --entities-out=<file> <metadata root>...
 * Each root is copied to <out>/<root>, pruned or not, so the push always reads from <out>.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync, readdirSync, statSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SYNC_CONFIG = '.mj-sync.json';

/** Lowercased, trimmed entity name: entity lookups in MJ are case-insensitive. */
export const normalizeEntityName = (name) => String(name).trim().toLowerCase();

/** Escapes a string for use inside a RegExp. */
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every entity a string value references: the target of each `@lookup:<Entity>.` and the value of
 * each `@lookup:MJ: Entities.Name=<Entity>` (nested lookups included).
 */
export function entitiesReferencedByString(value) {
    const found = [];
    const lookup = /@lookup:([^.@]+?)\./g;
    for (const match of value.matchAll(lookup)) found.push(match[1].trim());
    const entityRow = /@lookup:MJ: Entities\.Name=([^&?@"]+)/g;
    for (const match of value.matchAll(entityRow)) found.push(match[1].trim());
    return found;
}

/** Every entity a JSON value references, walking nested objects, arrays and `relatedEntities` keys. */
export function entitiesReferencedBy(node) {
    const found = [];
    const walk = (value) => {
        if (typeof value === 'string') {
            found.push(...entitiesReferencedByString(value));
        } else if (Array.isArray(value)) {
            value.forEach(walk);
        } else if (value && typeof value === 'object') {
            for (const [key, child] of Object.entries(value)) {
                if (key === 'relatedEntities' && child && typeof child === 'object' && !Array.isArray(child)) {
                    found.push(...Object.keys(child));
                }
                walk(child);
            }
        }
    };
    walk(node);
    return found;
}

/** True when the JSON value holds a lookup by Name to one of the removed records. */
export function referencesRemovedRecord(node, removed) {
    if (removed.size === 0) return false;
    const text = JSON.stringify(node);
    for (const key of removed) {
        const [entity, name] = key.split('\u0000');
        const pattern = new RegExp(`@lookup:${escapeRegExp(entity)}\\.Name=${escapeRegExp(name)}(?=$|[&?@"\\\\])`, 'i');
        if (pattern.test(text)) return true;
    }
    return false;
}

/** The records a parsed JSON file holds, or null when it is not a record file. */
export function recordsIn(parsed) {
    const isRecord = (r) => r && typeof r === 'object' && !Array.isArray(r) && r.fields && typeof r.fields === 'object';
    if (Array.isArray(parsed)) return parsed.length > 0 && parsed.every(isRecord) ? parsed : null;
    return isRecord(parsed) ? [parsed] : null;
}

/** Every file below a directory, recursively. */
function listFiles(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...listFiles(full));
        else out.push(full);
    }
    return out;
}

/**
 * Reads the metadata under the roots: each sync directory (with its entity and the entities its
 * config references) and each record file (with the entity of its nearest config).
 */
export function readMetadata(roots) {
    const dirs = [];
    const files = [];
    for (const root of roots) {
        const all = listFiles(root);
        for (const path of all.filter((f) => f.endsWith(`/${SYNC_CONFIG}`) || f === SYNC_CONFIG)) {
            const config = JSON.parse(readFileSync(path, 'utf8'));
            if (!config.entity) continue;
            dirs.push({ Dir: dirname(path), Entity: config.entity, References: [config.entity, ...entitiesReferencedBy(config.defaults ?? {})] });
        }
        const entityFor = (file) => {
            let best = null;
            for (const d of dirs) {
                if ((file.startsWith(`${d.Dir}/`)) && (!best || d.Dir.length > best.Dir.length)) best = d;
            }
            return best;
        };
        for (const path of all.filter((f) => f.endsWith('.json') && !f.endsWith(SYNC_CONFIG))) {
            let parsed;
            try {
                parsed = JSON.parse(readFileSync(path, 'utf8'));
            } catch {
                continue; // not JSON we can read; the push will report it if it matters
            }
            const records = recordsIn(parsed);
            const owner = entityFor(path);
            if (records && owner) files.push({ Path: path, Dir: owner.Dir, Entity: owner.Entity, Records: records, Single: !Array.isArray(parsed) });
        }
    }
    return { Dirs: dirs, Files: files };
}

/** The referenced entities the database does not have, by their name as written. */
export function findMissingEntities(metadata, presentNames) {
    const present = new Set([...presentNames].map(normalizeEntityName));
    const missing = new Map();
    const consider = (name) => {
        const key = normalizeEntityName(name);
        if (key && !present.has(key) && !missing.has(key)) missing.set(key, name.trim());
    };
    for (const d of metadata.Dirs) d.References.forEach(consider);
    for (const f of metadata.Files) for (const r of f.Records) entitiesReferencedBy(r).forEach(consider);
    return [...missing.values()].sort();
}

/**
 * Decides what to remove for a set of missing entities: whole directories, then records, then
 * (to a fixed point) records whose Name lookup points at a removed record.
 * @returns {{ RemovedDirs: string[], RemovedRecords: Map<string, Set<number>>, Removed: string[] }}
 */
export function planPrune(metadata, missingEntities) {
    const missing = new Set(missingEntities.map(normalizeEntityName));
    const namesMissing = (refs) => refs.some((r) => missing.has(normalizeEntityName(r)));
    const removedDirs = metadata.Dirs.filter((d) => namesMissing(d.References)).map((d) => d.Dir);
    const inRemovedDir = (path) => removedDirs.some((d) => path === d || path.startsWith(`${d}/`));
    const removedRecords = new Map();
    const removedKeys = new Set();
    const removed = [];
    const remove = (file, index, reason) => {
        if (!removedRecords.has(file.Path)) removedRecords.set(file.Path, new Set());
        if (removedRecords.get(file.Path).has(index)) return false;
        removedRecords.get(file.Path).add(index);
        const name = file.Records[index].fields?.Name;
        if (typeof name === 'string') removedKeys.add(`${file.Entity}\u0000${name}`);
        removed.push(`${file.Entity}${typeof name === 'string' ? ` "${name}"` : ` #${index}`} (${reason})`);
        return true;
    };
    for (const file of metadata.Files) {
        file.Records.forEach((record, i) => {
            if (inRemovedDir(file.Path)) remove(file, i, 'its directory');
            else if (namesMissing(entitiesReferencedBy(record))) remove(file, i, 'names a missing entity');
        });
    }
    for (let changed = true; changed; ) {
        changed = false;
        for (const file of metadata.Files) {
            file.Records.forEach((record, i) => {
                if (referencesRemovedRecord(record, removedKeys) && remove(file, i, 'looks up a removed record')) changed = true;
            });
        }
    }
    return { RemovedDirs: removedDirs, RemovedRecords: removedRecords, Removed: removed };
}

/** Copies each root to <out>/<root> and applies the plan to the copy. */
export function writePrunedCopy(roots, out, plan) {
    const base = process.cwd();
    const target = (path) => join(out, relative(base, resolve(path)));
    for (const root of roots) {
        rmSync(target(root), { recursive: true, force: true });
        mkdirSync(dirname(target(root)), { recursive: true });
        cpSync(root, target(root), { recursive: true });
    }
    for (const dir of plan.RemovedDirs) rmSync(target(dir), { recursive: true, force: true });
    for (const [path, indexes] of plan.RemovedRecords) {
        if (plan.RemovedDirs.some((d) => path.startsWith(`${d}/`))) continue;
        const parsed = JSON.parse(readFileSync(path, 'utf8'));
        if (!Array.isArray(parsed)) {
            rmSync(target(path), { force: true });
            continue;
        }
        const kept = parsed.filter((_, i) => !indexes.has(i));
        if (kept.length === 0) rmSync(target(path), { force: true });
        else writeFileSync(target(path), `${JSON.stringify(kept, null, 2)}\n`);
    }
}

function readArg(argv, name) {
    return argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function main(argv) {
    const mode = readArg(argv, 'mode');
    const presentPath = readArg(argv, 'present');
    const out = readArg(argv, 'out');
    const entitiesOut = readArg(argv, 'entities-out');
    const roots = argv.filter((a) => !a.startsWith('--'));
    if (mode !== 'regressions' && mode !== 'gate') {
        console.error(`prune-pg-parity-gap: --mode must be "regressions" or "gate" (got "${mode ?? ''}").`);
        return 2;
    }
    if (!presentPath || !out || !entitiesOut || roots.length === 0) {
        console.error('Usage: prune-pg-parity-gap.mjs --mode=<regressions|gate> --present=<file> --out=<dir> --entities-out=<file> <root>...');
        return 2;
    }
    if (!existsSync(presentPath)) {
        console.error(`prune-pg-parity-gap: ${presentPath} is missing.`);
        return 2;
    }
    const present = readFileSync(presentPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
    if (present.length === 0) {
        console.error('prune-pg-parity-gap: the database reported no entities; refusing to treat everything as a gap.');
        return 1;
    }
    const metadata = readMetadata(roots);
    const missing = findMissingEntities(metadata, present);
    writeFileSync(entitiesOut, missing.map((m) => `${m}\n`).join(''));
    const gap = missing.length > 0;
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `gap=${gap}\n`);
    if (!gap) {
        writePrunedCopy(roots, out, { RemovedDirs: [], RemovedRecords: new Map(), Removed: [] });
        console.log('No parity gap: every entity the metadata names exists on PostgreSQL. Pushing it unchanged.');
        return 0;
    }
    if (mode === 'gate') {
        console.log(`::error title=PostgreSQL parity gap::Missing on PostgreSQL: ${missing.join(', ')}. This run gates the build, so the PostgreSQL twins of those migrations must land first (/pg-migrate).`);
        return 1;
    }
    const plan = planPrune(metadata, missing);
    writePrunedCopy(roots, out, plan);
    const message = `Parity gap: missing on PostgreSQL: ${missing.join(', ')}. Their PostgreSQL migrations arrive with the next /pg-migrate build. The suite still runs; ${plan.Removed.length} record(s) that need them were left out of the push.`;
    console.log(`::warning title=PostgreSQL parity gap::${message}`);
    for (const line of plan.Removed) console.log(`  - ${line}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## PostgreSQL parity gap\n\n${message}\n\n${plan.Removed.map((l) => `- ${l}`).join('\n')}\n`);
    }
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(main(process.argv.slice(2)));
}
