#!/usr/bin/env node
/**
 * check-prompt-model-routes.mjs
 *
 * Every active AI Prompt Model row must point at an active model that has an active Inference
 * Provider route for the row's vendor.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────────
 * An AIPromptModel row pins a prompt to a (model, vendor) pair. At run time the prompt runner
 * resolves that pair through AIModelVendor; when the model is inactive, or the model has no
 * active Inference Provider row for that vendor, the candidate is silently dropped and the
 * prompt falls back to another model, or fails when it had no other candidate. MetadataSync
 * pushes such rows cleanly, so nothing caught them (MJ#4915).
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────────
 * For every `MJ: AI Prompt Models` record in metadata/ (top-level or nested under
 * relatedEntities) whose own Status is Active (a missing Status is the column default, Active):
 *   1. ModelID must name a model in the catalog, and that model must have IsActive true;
 *   2. VendorID must name a vendor in metadata/ai-vendors;
 *   3. the model must have an `MJ: AI Model Vendors` row for that vendor with
 *      TypeID = Inference Provider and Status = Active.
 * Rows whose Status is Inactive, Deprecated or Preview are exempt. Rows whose ModelID or
 * VendorID is not a Name @lookup (a raw UUID, @parent, ...) are skipped and counted, since they
 * cannot be resolved from metadata alone.
 *
 * ── BASELINE ────────────────────────────────────────────────────────────────────
 * prompt-model-routes-baseline.json lists the rows that failed when this guard was introduced.
 * A failure not in the baseline fails the guard; so does a baseline entry that no longer fails,
 * so the list only shrinks. Entries are keyed by the prompt-model row's primaryKey.ID, or by
 * "prompt | model | vendor" when the row has no primary key yet.
 *
 * Usage (from any directory):
 *   node check-prompt-model-routes.mjs                         # metadata/ of this repository
 *   node check-prompt-model-routes.mjs <metadataDir> [baseline] # another metadata tree / baseline
 */
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';

const RED = '\x1b[0;31m', YELLOW = '\x1b[0;33m', GREEN = '\x1b[0;32m', NC = '\x1b[0m';
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = resolve(SCRIPT_DIR, '..', '..', 'metadata');
const DEFAULT_BASELINE = join(SCRIPT_DIR, 'prompt-model-routes-baseline.json');

const MODEL_LOOKUP = '@lookup:MJ: AI Models.Name=';
const VENDOR_LOOKUP = '@lookup:MJ: AI Vendors.Name=';
const INFERENCE_PROVIDER = '@lookup:MJ: AI Vendor Type Definitions.Name=Inference Provider';

const E_MODELS = 'MJ: AI Models';
const E_MODEL_VENDORS = 'MJ: AI Model Vendors';
const E_VENDORS = 'MJ: AI Vendors';
const E_PROMPT_MODELS = 'MJ: AI Prompt Models';

const norm = (s) => String(s).trim().toLowerCase();

/** The entity a directory's records belong to: the nearest .mj-sync.json with an `entity`, up to `root`. */
function entityFor(dirAbs, root, cache) {
    if (cache.has(dirAbs)) return cache.get(dirAbs);
    let entity = null;
    const cfg = join(dirAbs, '.mj-sync.json');
    if (existsSync(cfg)) entity = JSON.parse(readFileSync(cfg, 'utf8')).entity ?? null;
    if (!entity && dirAbs !== root && dirAbs.startsWith(root)) entity = entityFor(dirname(dirAbs), root, cache);
    cache.set(dirAbs, entity);
    return entity;
}

/**
 * Every record in a metadata tree, flattened: top-level records of each dot-prefixed JSON file
 * (minus `.mj-sync.json` and `.backups`), plus every record nested under `relatedEntities`.
 * @returns {{ file: string, entity: string, record: object, parent: object | null }[]}
 */
export function loadRecords(root) {
    root = resolve(root);
    const cache = new Map();
    const out = [];
    const walk = (record, entity, parent, file) => {
        if (!record || typeof record !== 'object') return;
        out.push({ file, entity, record, parent });
        for (const [child, list] of Object.entries(record.relatedEntities ?? {})) {
            for (const c of Array.isArray(list) ? list : [list]) walk(c, child, record, file);
        }
    };
    const files = readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((d) => d.isFile() && d.name.startsWith('.') && d.name.endsWith('.json') && d.name !== '.mj-sync.json')
        .map((d) => join(d.parentPath, d.name))
        .filter((abs) => !relative(root, abs).split(sep).some((p) => p === '.backups' || p === 'node_modules'))
        .sort();
    for (const abs of files) {
        const entity = entityFor(dirname(abs), root, cache);
        if (!entity) continue;
        const parsed = JSON.parse(readFileSync(abs, 'utf8'));
        for (const r of Array.isArray(parsed) ? parsed : [parsed]) walk(r, entity, null, relative(root, abs));
    }
    return out;
}

/** The name a Name @lookup points at, or null when the value is anything else. */
function lookupName(value, prefix) {
    return typeof value === 'string' && value.startsWith(prefix) ? value.slice(prefix.length).trim() : null;
}

/**
 * @returns {{ checked: number, exempt: number, skipped: { file: string, prompt: string, key: string }[],
 *             failures: { key: string, file: string, prompt: string, model: string, vendor: string, reason: string }[] }}
 */
export function findRouteViolations(records) {
    const models = new Map();   // normalized name -> { name, active, routes: [] }
    const vendors = new Set();  // normalized vendor names
    const modelEntry = (name) => {
        const k = norm(name);
        if (!models.has(k)) models.set(k, { name, active: undefined, routes: [] });
        return models.get(k);
    };
    for (const { entity, record, parent } of records) {
        const f = record.fields ?? {};
        if (entity === E_MODELS && f.Name != null) {
            const m = modelEntry(f.Name);
            m.name = f.Name;
            m.active = f.IsActive;
        } else if (entity === E_VENDORS && f.Name != null) {
            vendors.add(norm(f.Name));
        } else if (entity === E_MODEL_VENDORS) {
            const owner = lookupName(f.ModelID, MODEL_LOOKUP) ?? (f.ModelID === '@parent:ID' ? parent?.fields?.Name : null);
            if (owner != null) modelEntry(owner).routes.push(f);
        }
    }

    let checked = 0, exempt = 0;
    const skipped = [], failures = [];
    for (const { file, entity, record, parent } of records) {
        if (entity !== E_PROMPT_MODELS) continue;
        const f = record.fields ?? {};
        const prompt = String(parent?.fields?.Name ?? f.PromptID ?? '(unknown prompt)');
        const modelName = lookupName(f.ModelID, MODEL_LOOKUP);
        const vendorName = lookupName(f.VendorID, VENDOR_LOOKUP);
        const key = record.primaryKey?.ID ? String(record.primaryKey.ID).toUpperCase() : `${prompt} | ${modelName ?? f.ModelID} | ${vendorName ?? f.VendorID}`;
        if ((f.Status ?? 'Active') !== 'Active') { exempt++; continue; }
        if (modelName == null || vendorName == null) { skipped.push({ file, prompt, key }); continue; }
        checked++;
        const fail = (reason) => failures.push({ key, file, prompt, model: modelName, vendor: vendorName, reason });
        const m = models.get(norm(modelName));
        if (!m || m.active === undefined) { fail('model not found in metadata'); continue; }
        if (m.active !== true) { fail('model is inactive'); continue; }
        if (!vendors.has(norm(vendorName))) { fail('vendor not found in metadata'); continue; }
        const forVendor = m.routes.filter((r) => norm(lookupName(r.VendorID, VENDOR_LOOKUP) ?? '') === norm(vendorName));
        const inference = forVendor.filter((r) => r.TypeID === INFERENCE_PROVIDER);
        if (inference.some((r) => (r.Status ?? 'Active') === 'Active')) continue;
        if (inference.length > 0) fail(`Inference Provider route is ${inference.map((r) => r.Status).join('/')}`);
        else if (forVendor.length > 0) fail('vendor has no Inference Provider route (Model Developer only)');
        else fail('model has no route for this vendor');
    }
    return { checked, exempt, skipped, failures };
}

/** Load the baseline file: `{ entries: [{ key, prompt, model, vendor, reason }] }`. Missing file = empty. */
export function loadBaseline(path) {
    if (!existsSync(path)) return [];
    return JSON.parse(readFileSync(path, 'utf8')).entries ?? [];
}

/** Split failures into new ones and baselined ones, and find baseline entries that no longer fail. */
export function compareToBaseline(failures, baseline) {
    const keys = new Set(baseline.map((b) => norm(b.key)));
    const failing = new Set(failures.map((f) => norm(f.key)));
    return {
        unexpected: failures.filter((f) => !keys.has(norm(f.key))),
        known: failures.filter((f) => keys.has(norm(f.key))),
        stale: baseline.filter((b) => !failing.has(norm(b.key))),
    };
}

const REMEDIATION = `
${RED}AI Prompt Model rows without a usable inference route${NC}

Each row above pins a prompt to a model and vendor the runtime cannot call, so the prompt
silently falls back to another candidate, or fails when it has none. Fix one of:
  - point the row at a model/vendor pair that has an active Inference Provider route;
  - add (or reactivate) the model's MJ: AI Model Vendors row for that vendor with
    TypeID = Inference Provider and Status = Active, if the vendor really serves the model;
  - set the row's Status to Inactive if it should stay but not be used.

A baseline entry that no longer fails was fixed: delete it from
.github/scripts/prompt-model-routes-baseline.json.

Background: MJ#4915.`;

function main(argv) {
    const dir = argv[0] ? resolve(argv[0]) : DEFAULT_DIR;
    const baselinePath = argv[1] ? resolve(argv[1]) : DEFAULT_BASELINE;
    const { checked, exempt, skipped, failures } = findRouteViolations(loadRecords(dir));
    const { unexpected, known, stale } = compareToBaseline(failures, loadBaseline(baselinePath));

    for (const f of unexpected) {
        console.log(`${RED}✗ ${f.file}${NC}: prompt "${f.prompt}" → model "${f.model}" @ vendor "${f.vendor}": ${f.reason} ${YELLOW}[${f.key}]${NC}`);
    }
    for (const b of stale) {
        console.log(`${RED}✗ baseline${NC}: prompt "${b.prompt}" → "${b.model}" @ "${b.vendor}" no longer fails — remove ${YELLOW}${b.key}${NC} from the baseline`);
    }
    const summary = `${checked} active prompt-model rows checked, ${exempt} non-Active exempt, ${skipped.length} skipped (non-@lookup ModelID/VendorID), ${known.length} baselined`;
    if (skipped.length) console.log(`${YELLOW}skipped:${NC} ${skipped.map((s) => `${s.file} "${s.prompt}" [${s.key}]`).join('; ')}`);
    if (unexpected.length + stale.length > 0) {
        console.log(REMEDIATION);
        console.log(`\n${summary}`);
        return 1;
    }
    console.log(`${GREEN}✓ ${summary}; no new route failures${NC}`);
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
