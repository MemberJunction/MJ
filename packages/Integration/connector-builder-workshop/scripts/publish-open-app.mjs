#!/usr/bin/env node
/**
 * publish-open-app.mjs — workshop MACHINERY (lives in MJ). Assembles a connector that was BUILT +
 * VERIFIED in the MJ monorepo sandbox into a pristine Open App in the MemberJunction/Integrations repo.
 *
 * The build machinery (extract → freeze → code-build → T0–T8 ladder → hybrid-e2e → floor-check) runs in
 * the MJ sandbox under the connector's TS class SYMBOL (<ClassBase>Connector). This step writes the
 * DELIVERABLE to the Integrations repo and forces the FOUR-WAY identity invariant:
 *
 *   package.json name == mj-app.json packages.server[0].name == Integration.ClassName
 *     == Integration.ImportPath == @RegisterClass key == @memberjunction/connector-<slug>
 *
 * The TS class symbol / file stays <ClassBase>Connector (a separate identity). IntegrationName === Name.
 *
 * Usage:
 *   node publish-open-app.mjs --repo <integrationsRepo> --category <Category> --class-base <ClassBase> \
 *        --connector <builtConnector.ts> --metadata <builtMetadata.json> [--display "Name"] [--skip-seed]
 *
 * It REUSES the Integrations-repo scripts (new-connector / build-seed-migrations / build-connectors-catalog
 * / validate-invariants) — it never reimplements them. The seed step needs a reachable DB and is
 * best-effort (non-blocking); validate-invariants is the hard gate. Output is a single JSON object on stdout.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const arg = (name, def = null) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : def; };
const flag = (name) => process.argv.includes(`--${name}`);

const REPO = arg('repo');
const CATEGORY = arg('category');
const CLASS_BASE = arg('class-base');        // e.g. GrowthZone — the TS class symbol is <ClassBase>Connector
const BUILT_CONNECTOR = arg('connector');    // the sandbox-built connector .ts
const BUILT_METADATA = arg('metadata');      // the sandbox-built .integration.json
const DISPLAY = arg('display', CLASS_BASE);
const SKIP_SEED = flag('skip-seed');

const fail = (msg) => { console.log(JSON.stringify({ ok: false, error: msg })); process.exit(1); };
for (const [k, v] of Object.entries({ repo: REPO, category: CATEGORY, 'class-base': CLASS_BASE, connector: BUILT_CONNECTOR, metadata: BUILT_METADATA })) {
    if (!v) fail(`--${k} is required`);
}

// Same slug derivation as new-connector.mjs (keep these in lockstep).
const slug = CLASS_BASE.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const PKG = `@memberjunction/connector-${slug}`;
const CLASS_NAME = `${CLASS_BASE}Connector`;
const appDir = join(REPO, CATEGORY, CLASS_BASE);
const steps = [];
const run = (args) => execFileSync('node', args, { cwd: REPO, stdio: 'pipe' });

// 1. Scaffold the Open App if absent (package.json / mj-app.json / src/index.ts shim / migrations / metadata).
if (!existsSync(appDir)) {
    try { run(['scripts/new-connector.mjs', CATEGORY, CLASS_BASE, '--name', DISPLAY]); steps.push({ step: 'scaffold', ok: true }); }
    catch (e) { steps.push({ step: 'scaffold', ok: false, error: String(e.stderr ?? e.message ?? e).slice(0, 300) }); }
} else {
    steps.push({ step: 'scaffold', ok: true, note: 'already exists — reused' });
}

// 2. Connector source → Open App src/, forcing the @RegisterClass KEY to the package name (symbol/file unchanged).
if (!existsSync(BUILT_CONNECTOR)) fail(`built connector not found: ${BUILT_CONNECTOR}`);
let src = readFileSync(BUILT_CONNECTOR, 'utf8');
src = src.replace(/@RegisterClass\(\s*BaseIntegrationConnector\s*,\s*['"][^'"]+['"]\s*\)/,
    `@RegisterClass(BaseIntegrationConnector, '${PKG}')`);
const keyOk = new RegExp(`@RegisterClass\\(\\s*BaseIntegrationConnector\\s*,\\s*['"]${PKG.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}['"]`).test(src);
mkdirSync(join(appDir, 'src'), { recursive: true });
writeFileSync(join(appDir, 'src', `${CLASS_NAME}.ts`), src);
steps.push({ step: 'connector', ok: keyOk, key: PKG, ...(keyOk ? {} : { error: 'could not rewrite @RegisterClass key — check the source decorator' }) });

// 3. Metadata → Open App metadata/integration/, forcing Integration.ClassName + ImportPath = package name.
if (!existsSync(BUILT_METADATA)) fail(`built metadata not found: ${BUILT_METADATA}`);
const meta = JSON.parse(readFileSync(BUILT_METADATA, 'utf8'));
const recs = Array.isArray(meta) ? meta : [meta];
const integ = recs.find((r) => r?.fields?.ClassName ?? r?.fields?.Name);
if (!integ) fail('no Integration record (fields.ClassName/Name) in metadata');
integ.fields.ClassName = PKG;
integ.fields.ImportPath = PKG;
const metaDir = join(appDir, 'metadata', 'integration');
mkdirSync(metaDir, { recursive: true });
writeFileSync(join(metaDir, `.${slug}.integration.json`), JSON.stringify(recs, null, 2) + '\n');
steps.push({ step: 'metadata', ok: true, className: PKG, importPath: PKG });

// 4. Seed migration (reset catalog → mj sync push → wrap → pg-convert). Needs a reachable DB — best-effort.
if (SKIP_SEED) {
    steps.push({ step: 'seed', ok: true, skipped: true });
} else {
    try { run(['scripts/build-seed-migrations.mjs', `${CATEGORY}/${CLASS_BASE}`]); steps.push({ step: 'seed', ok: true }); }
    catch (e) { steps.push({ step: 'seed', ok: false, blocking: false, error: String(e.stderr ?? e.message ?? e).slice(0, 300), note: 'needs a reachable DB — run scripts/build-seed-migrations.mjs <Cat>/<Conn> once a DB is available' }); }
}

// 5. Regenerate the lightweight gallery catalog.
try { run(['scripts/build-connectors-catalog.mjs']); steps.push({ step: 'catalog', ok: true }); }
catch (e) { steps.push({ step: 'catalog', ok: false, error: String(e.stderr ?? e.message ?? e).slice(0, 200) }); }

// 6. Changeset (a minor bump for the new/changed connector package).
const changeDir = join(REPO, '.changeset');
if (existsSync(changeDir)) {
    writeFileSync(join(changeDir, `connector-${slug}.md`), `---\n"${PKG}": minor\n---\n\n${DISPLAY} connector published as an Open App.\n`);
    steps.push({ step: 'changeset', ok: true });
}

// 7. The GATE: validate-invariants.mjs enforces the four-way identity + Open App package shape.
let validated = false, validateOut = '';
try { execFileSync('node', ['scripts/validate-invariants.mjs'], { cwd: REPO, stdio: 'pipe' }); validated = true; }
catch (e) { validateOut = String(e.stdout ?? e.stderr ?? e.message ?? e).slice(0, 800); }
steps.push({ step: 'validate-invariants', ok: validated, output: validated ? 'pass' : validateOut });

// Overall ok: every step except the best-effort DB seed must pass.
const ok = steps.every((s) => s.step === 'seed' || s.ok !== false);
console.log(JSON.stringify({ ok, package: PKG, appDir: `${CATEGORY}/${CLASS_BASE}`, className: CLASS_NAME, classSymbol: CLASS_NAME, steps }, null, 2));
process.exit(ok ? 0 : 1);
