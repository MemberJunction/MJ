#!/usr/bin/env node
/**
 * Finds the PostgreSQL PARITY GAP before the metadata push, and removes from the metadata only what
 * the PostgreSQL database cannot take, so the integration suite still runs.
 *
 * A feature PR ships T-SQL migrations only; their PostgreSQL twins arrive later, in the build
 * engineer's /pg-migrate PR. Until then the PostgreSQL database built from migrations-pg lacks the
 * new entities and columns, and `mj sync push` refuses any metadata that needs them. Skipping the
 * suite on that gap would leave every other PR without PostgreSQL coverage, so instead:
 *
 *   - A MISSING ENTITY is one the metadata names that the database has no `__mj.Entity` row for: a
 *     sync directory's entity or `defaults`, a `@lookup:<Entity>.` target, a
 *     `@lookup:MJ: Entities.Name=<Entity>` value, or a `relatedEntities` key.
 *   - A MISSING FIELD is a column of an entity the database does have, named by a
 *     `@lookup:MJ: Entity Fields.` lookup (an `EntityID`/`Entity` and a `Name`), with no
 *     `__mj.EntityField` row.
 *   - Prose that merely mentions a name (a Description) is not a reference.
 *
 * What is removed: a directory whose entity is missing; the smallest record that needs the gap (a
 * nested `relatedEntities` child is removed on its own, its parent kept; a `relatedEntities` key
 * naming a missing entity is dropped); then, to a fixed point, any record whose
 * `@lookup:<Entity>.Name=<Name>` points at a top-level record removed above. Everything else is
 * pushed unchanged, and a push of the result that still fails is a regression.
 *
 * Modes (integration.yml's `pg` output):
 *   - `regressions`: a gap is reported as a warning, the metadata is pruned and the suite runs.
 *   - `gate`: the build engineer's PR, a dispatch, or a release. A gap fails (exit 1): closing it is
 *     that run's job, so nothing is pruned.
 *
 * Writes `gap=true|false` to $GITHUB_OUTPUT, and to --gap-out the missing entities and the missing
 * fields' names, one per line: the known-failures check attributes a failure that names one of them
 * to the gap.
 *
 * The prune EDITS THE ROOTS IN PLACE (`--in-place` is required to say so). It is meant for a CI
 * checkout that is thrown away after the job. Pruning a copy elsewhere does not work: prompt
 * templates `{@include}` files by paths that climb out of the metadata root (../../packages/...).
 *
 * Usage:
 *   node .github/scripts/prune-pg-parity-gap.mjs --mode=<regressions|gate> --in-place \
 *     --present=<file: one entity name per line> \
 *     --present-fields=<file: "<entity>\t<field>" per line> \
 *     --gap-out=<file> <metadata root>...
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SYNC_CONFIG = '.mj-sync.json';

/** Lowercased, trimmed name: entity and field lookups in MJ are case-insensitive. */
export const normalizeName = (name) => String(name).trim().toLowerCase();

/** The key of an (entity, field) pair. */
export const fieldKey = (entity, field) => `${normalizeName(entity)}\u0000${normalizeName(field)}`;

/** Escapes a string for use inside a RegExp. */
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every entity a string value references: the target of each `@lookup:<Entity>.` and the value of
 * each `@lookup:MJ: Entities.Name=<Entity>` (nested lookups included).
 */
export function entitiesReferencedByString(value) {
    const found = [];
    for (const match of value.matchAll(/@lookup:([^.@]+?)\./g)) found.push(match[1].trim());
    for (const match of value.matchAll(/@lookup:MJ: Entities\.Name=([^&?@"]+)/g)) found.push(match[1].trim());
    return found;
}

/**
 * Every (entity, field) a string value looks up in `MJ: Entity Fields`, as `{ Entity, Field }`.
 * Reads `EntityID=@lookup:MJ: Entities.Name=<entity>` or `Entity=<entity>`, and `Name=<field>`, in
 * either order.
 */
export function fieldsReferencedByString(value) {
    const found = [];
    const at = value.indexOf('@lookup:MJ: Entity Fields.');
    if (at < 0) return found;
    const params = value.slice(at + '@lookup:MJ: Entity Fields.'.length).split('?')[0];
    let entity = null;
    let field = null;
    for (const part of params.split('&')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        const key = part.slice(0, eq).trim();
        const val = part.slice(eq + 1).trim();
        if (key === 'Name') field = val;
        else if (key === 'Entity') entity = val;
        else if (key === 'EntityID') entity = /^@lookup:MJ: Entities\.Name=(.+)$/.exec(val)?.[1]?.trim() ?? null;
    }
    if (entity && field) found.push({ Entity: entity, Field: field });
    return found;
}

/** Walks every string in a JSON value. */
function eachString(node, visit) {
    if (typeof node === 'string') visit(node);
    else if (Array.isArray(node)) node.forEach((n) => eachString(n, visit));
    else if (node && typeof node === 'object') Object.values(node).forEach((n) => eachString(n, visit));
}

/** A record without its `relatedEntities`: what the record itself names. */
const ownPart = (record) => {
    const { relatedEntities, ...own } = record;
    return own;
};

/** Every entity a JSON value references, walking nested objects, arrays and `relatedEntities` keys. */
export function entitiesReferencedBy(node) {
    const found = [];
    const walk = (value) => {
        if (typeof value === 'string') found.push(...entitiesReferencedByString(value));
        else if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === 'object') {
            for (const [key, child] of Object.entries(value)) {
                if (key === 'relatedEntities' && child && typeof child === 'object' && !Array.isArray(child)) found.push(...Object.keys(child));
                walk(child);
            }
        }
    };
    walk(node);
    return found;
}

/** Every (entity, field) a JSON value looks up, walking it whole. */
export function fieldsReferencedBy(node) {
    const found = [];
    eachString(node, (s) => found.push(...fieldsReferencedByString(s)));
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
 * Reads the metadata under the roots: each sync directory (its entity, and the entities its config
 * references) and each record file (with the entity of its nearest config).
 */
export function readMetadata(roots) {
    const dirs = [];
    const files = [];
    for (const root of roots) {
        const all = listFiles(root);
        for (const path of all.filter((f) => f.endsWith(`/${SYNC_CONFIG}`))) {
            const config = JSON.parse(readFileSync(path, 'utf8'));
            if (!config.entity) continue;
            dirs.push({ Dir: dirname(path), Entity: config.entity, Defaults: config.defaults ?? {} });
        }
        const ownerOf = (file) => {
            let best = null;
            for (const d of dirs) if (file.startsWith(`${d.Dir}/`) && (!best || d.Dir.length > best.Dir.length)) best = d;
            return best;
        };
        for (const path of all.filter((f) => f.endsWith('.json') && !f.endsWith(SYNC_CONFIG))) {
            let parsed;
            try {
                parsed = JSON.parse(readFileSync(path, 'utf8'));
            } catch {
                continue; // not JSON we can read; the push reports it if it matters
            }
            const records = recordsIn(parsed);
            const owner = ownerOf(path);
            if (records && owner) files.push({ Path: path, Entity: owner.Entity, Records: records, Single: !Array.isArray(parsed) });
        }
    }
    return { Dirs: dirs, Files: files };
}

/**
 * The gap: referenced entities the database lacks (by their name as written), and referenced fields
 * of present entities that it lacks.
 * @returns {{ Entities: string[], Fields: { Entity: string, Field: string }[] }}
 */
export function findGap(metadata, presentEntities, presentFields) {
    const entities = new Set([...presentEntities].map(normalizeName));
    const fields = new Set([...presentFields].map(([e, f]) => fieldKey(e, f)));
    const missingEntities = new Map();
    const missingFields = new Map();
    const considerEntity = (name) => {
        const key = normalizeName(name);
        if (key && !entities.has(key) && !missingEntities.has(key)) missingEntities.set(key, name.trim());
    };
    const considerField = ({ Entity, Field }) => {
        if (!entities.has(normalizeName(Entity))) return; // the entity rule covers it
        const key = fieldKey(Entity, Field);
        if (!fields.has(key) && !missingFields.has(key)) missingFields.set(key, { Entity: Entity.trim(), Field: Field.trim() });
    };
    for (const d of metadata.Dirs) {
        considerEntity(d.Entity);
        entitiesReferencedBy(d.Defaults).forEach(considerEntity);
        fieldsReferencedBy(d.Defaults).forEach(considerField);
    }
    for (const f of metadata.Files) {
        for (const r of f.Records) {
            entitiesReferencedBy(r).forEach(considerEntity);
            fieldsReferencedBy(r).forEach(considerField);
        }
    }
    return {
        Entities: [...missingEntities.values()].sort(),
        Fields: [...missingFields.values()].sort((a, b) => `${a.Entity}.${a.Field}`.localeCompare(`${b.Entity}.${b.Field}`)),
    };
}

/** A predicate: does this part of a record need the gap, or a removed record? Returns a reason or null. */
function makeNeedsGap(gap, removedKeys) {
    const entities = new Set(gap.Entities.map(normalizeName));
    const fields = new Set(gap.Fields.map((f) => fieldKey(f.Entity, f.Field)));
    return (part) => {
        if (entitiesReferencedBy(part).some((e) => entities.has(normalizeName(e)))) return 'names a missing entity';
        if (fieldsReferencedBy(part).some((f) => fields.has(fieldKey(f.Entity, f.Field)))) return 'names a missing field';
        if (referencesRemovedRecord(part, removedKeys)) return 'looks up a removed record';
        return null;
    };
}

/**
 * Prunes one record: null when the record itself needs the gap, otherwise a copy without the
 * nested children (or relatedEntities keys) that do. `removed` collects a line per removal.
 */
export function pruneRecord(record, entity, needsGap, missingEntities, removed) {
    const reason = needsGap(ownPart(record));
    const label = (e, r) => `${e}${typeof r.fields?.Name === 'string' ? ` "${r.fields.Name}"` : ''}`;
    if (reason) {
        removed.push(`${label(entity, record)} (${reason})`);
        return null;
    }
    if (!record.relatedEntities || typeof record.relatedEntities !== 'object') return record;
    const related = {};
    for (const [childEntity, children] of Object.entries(record.relatedEntities)) {
        if (missingEntities.has(normalizeName(childEntity))) {
            removed.push(`${label(entity, record)} → its ${childEntity} (names a missing entity)`);
            continue;
        }
        if (!Array.isArray(children)) {
            related[childEntity] = children;
            continue;
        }
        const nested = [];
        const kept = children.map((c) => pruneRecord(c, childEntity, needsGap, missingEntities, nested)).filter((c) => c !== null);
        removed.push(...nested.map((n) => `${label(entity, record)} → ${n}`));
        related[childEntity] = kept;
    }
    return { ...record, relatedEntities: related };
}

/**
 * The whole prune: directories whose entity is missing, then records and nested children, repeated
 * until no record looks up one removed in an earlier pass.
 * @returns {{ RemovedDirs: string[], Files: Map<string, object[]>, Removed: string[] }}
 *   `Files` maps each changed file to the records it keeps (an empty array means delete the file).
 */
export function planPrune(metadata, gap) {
    const missingEntities = new Set(gap.Entities.map(normalizeName));
    const removedDirs = metadata.Dirs.filter(
        (d) => missingEntities.has(normalizeName(d.Entity)) || entitiesReferencedBy(d.Defaults).some((e) => missingEntities.has(normalizeName(e))),
    ).map((d) => d.Dir);
    const inRemovedDir = (path) => removedDirs.some((d) => path.startsWith(`${d}/`));
    const nameKey = (entity, record) => (typeof record.fields?.Name === 'string' ? `${entity}\u0000${record.fields.Name}` : null);
    const dirKeys = new Set();
    const dirLines = [];
    for (const file of metadata.Files.filter((f) => inRemovedDir(f.Path))) {
        for (const r of file.Records) {
            const key = nameKey(file.Entity, r);
            if (key) dirKeys.add(key);
            dirLines.push(`${file.Entity}${typeof r.fields?.Name === 'string' ? ` "${r.fields.Name}"` : ''} (its directory)`);
        }
    }
    const live = metadata.Files.filter((f) => !inRemovedDir(f.Path));
    // Each pass prunes from the original records with every key removed so far; a larger key set
    // only removes more, so the passes stop when one removes no new top-level record.
    let removedKeys = dirKeys;
    for (;;) {
        const needsGap = makeNeedsGap(gap, removedKeys);
        const files = new Map(metadata.Files.filter((f) => inRemovedDir(f.Path)).map((f) => [f.Path, []]));
        const lines = [...dirLines];
        const keys = new Set(dirKeys);
        for (const file of live) {
            const fileLines = [];
            const kept = [];
            for (const r of file.Records) {
                const pruned = pruneRecord(r, file.Entity, needsGap, missingEntities, fileLines);
                if (pruned) kept.push(pruned);
                else if (nameKey(file.Entity, r)) keys.add(nameKey(file.Entity, r));
            }
            if (fileLines.length > 0) {
                files.set(file.Path, kept);
                lines.push(...fileLines);
            }
        }
        if (keys.size === removedKeys.size) return { RemovedDirs: removedDirs, Files: files, Removed: lines };
        removedKeys = keys;
    }
}

/** Applies the plan to the files themselves. */
export function applyPrune(plan, metadata) {
    for (const dir of plan.RemovedDirs) rmSync(dir, { recursive: true, force: true });
    const single = new Map(metadata.Files.map((f) => [f.Path, f.Single]));
    for (const [path, records] of plan.Files) {
        if (!existsSync(path)) continue; // its directory went above
        if (records.length === 0) rmSync(path, { force: true });
        else writeFileSync(path, `${JSON.stringify(single.get(path) ? records[0] : records, null, 2)}\n`);
    }
}

function readArg(argv, name) {
    return argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

/** Reads a file of lines, or null when it is missing. */
function readLines(path) {
    if (!path || !existsSync(path)) return null;
    return readFileSync(path, 'utf8').split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '');
}

function main(argv) {
    const mode = readArg(argv, 'mode');
    const inPlace = argv.includes('--in-place');
    const gapOut = readArg(argv, 'gap-out');
    const roots = argv.filter((a) => !a.startsWith('--'));
    if (mode !== 'regressions' && mode !== 'gate') {
        console.error(`prune-pg-parity-gap: --mode must be "regressions" or "gate" (got "${mode ?? ''}").`);
        return 2;
    }
    const present = readLines(readArg(argv, 'present'));
    const presentFields = readLines(readArg(argv, 'present-fields'));
    if (!inPlace || !present || !presentFields || !gapOut || roots.length === 0) {
        console.error('Usage: prune-pg-parity-gap.mjs --mode=<regressions|gate> --in-place --present=<file> --present-fields=<file> --gap-out=<file> <root>...');
        return 2;
    }
    if (present.length === 0 || presentFields.length === 0) {
        console.error('prune-pg-parity-gap: the database reported no entities or fields; refusing to treat everything as a gap.');
        return 1;
    }
    const metadata = readMetadata(roots);
    const gap = findGap(metadata, present, presentFields.map((l) => l.split('\t')));
    const names = [...gap.Entities, ...gap.Fields.map((f) => f.Field)];
    writeFileSync(gapOut, names.map((n) => `${n}\n`).join(''));
    const isGap = names.length > 0;
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `gap=${isGap}\n`);
    if (!isGap) {
        console.log('No parity gap: every entity and field the metadata names exists on PostgreSQL. Pushing it unchanged.');
        return 0;
    }
    const described = [...gap.Entities, ...gap.Fields.map((f) => `${f.Entity}.${f.Field}`)].join(', ');
    if (mode === 'gate') {
        console.log(`::error title=PostgreSQL parity gap::Missing on PostgreSQL: ${described}. This run gates the build, so the PostgreSQL twins of those migrations must land first (/pg-migrate).`);
        return 1;
    }
    const plan = planPrune(metadata, gap);
    applyPrune(plan, metadata);
    const message = `Parity gap: missing on PostgreSQL: ${described}. Their PostgreSQL migrations arrive with the next /pg-migrate build. The suite still runs; ${plan.Removed.length} record(s) that need them were left out of the push.`;
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
