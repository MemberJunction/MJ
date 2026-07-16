#!/usr/bin/env node
/**
 * publish-open-app.mjs — workshop MACHINERY (lives in MJ). Assembles a connector that was BUILT +
 * VERIFIED in the MJ monorepo sandbox into a pristine Open App in the MemberJunction/Integrations repo.
 *
 * The build machinery (extract → freeze → code-build → T0–T8 ladder → hybrid-e2e → floor-check) runs in
 * the MJ sandbox under the connector's TS class SYMBOL (<ClassBase>Connector). This step writes the
 * DELIVERABLE to the Integrations repo and enforces the identity invariants that the repo's
 * validate-invariants.mjs ACTUALLY checks — which are NOT a single four-way equality:
 *
 *   package.json name == mj-app.json packages.server[0].name == Integration.ImportPath
 *     == @memberjunction/connector-<slug>
 *   Integration.ClassName == the @RegisterClass key == the TS class SYMBOL <ClassBase>Connector
 *     (and that symbol is exported by this package's own src)
 *
 * So ImportPath is the PACKAGE name, while ClassName/@RegisterClass stay the TS SYMBOL — do NOT collapse
 * ClassName onto the package name (that diverges from every shipped connector and is not what the gate
 * wants). The <slug> is the vendor's BRAND slug (magnetmail, hubspot, openwater — NOT the mechanical
 * de-camel magnet-mail/hub-spot/open-water): for an EXISTING Open App it is read from its own package.json
 * (so a re-publish never renames a shipped package); else pass --slug; else it is derived from <ClassBase>.
 * IntegrationName === Name. Full Open App model: mj-app declares schema{name} + migrations + metadata.
 *
 * Usage:
 *   node publish-open-app.mjs --repo <integrationsRepo> --category <Category> --class-base <ClassBase> \
 *        --connector <builtConnector.ts> --metadata <builtMetadata.json> \
 *        [--display "Name"] [--slug <brand-slug>] [--bump major|minor|patch] [--skip-seed]
 *
 * --slug   override the package-name suffix when the brand slug differs from the de-camel of ClassBase
 *          AND no existing Open App package.json is present to read it from.
 * --bump   changeset level: 'major' for a redo/breaking override (N.0.0), else minor/patch. Version
 *          numbers themselves are NOT written here — `changeset version` bumps package.json from its
 *          last-released value and sync-manifest-versions.mjs syncs mj-app.json; pre-bumping would
 *          double-bump. This step only DECLARES the bump via the changeset.
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
const BUMP = arg('bump', 'minor');
const SKIP_SEED = flag('skip-seed');

const fail = (msg) => { console.log(JSON.stringify({ ok: false, error: msg })); process.exit(1); };
for (const [k, v] of Object.entries({ repo: REPO, category: CATEGORY, 'class-base': CLASS_BASE, connector: BUILT_CONNECTOR, metadata: BUILT_METADATA })) {
    if (!v) fail(`--${k} is required`);
}
if (!['major', 'minor', 'patch'].includes(BUMP)) fail(`--bump must be major|minor|patch (was '${BUMP}')`);

const appDir = join(REPO, CATEGORY, CLASS_BASE);
// slug = the vendor's BRAND slug (magnetmail, hubspot — NOT the mechanical de-camel magnet-mail/hub-spot).
// Source of truth, in order: (1) an EXISTING Open App's own package.json name (so a re-publish never
// renames a shipped package and breaks the ImportPath==pkgName invariant); (2) explicit --slug; (3) the
// de-camel of ClassBase, as a last-resort default for a brand-new connector.
const derivedSlug = CLASS_BASE.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
let slug = arg('slug');
if (!slug && existsSync(join(appDir, 'package.json'))) {
    try { slug = (JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')).name || '').replace(/^@memberjunction\/connector-/, '') || null; }
    catch { /* fall through to derived */ }
}
slug = slug || derivedSlug;
const PKG = `@memberjunction/connector-${slug}`;
const CLASS_NAME = `${CLASS_BASE}Connector`;   // TS class symbol == @RegisterClass key == Integration.ClassName
const steps = [];
const run = (args) => execFileSync('node', args, { cwd: REPO, stdio: 'pipe' });

// 1. Scaffold the Open App if absent (package.json / mj-app.json / src/index.ts shim / migrations / metadata).
if (!existsSync(appDir)) {
    try { run(['scripts/new-connector.mjs', CATEGORY, CLASS_BASE, '--name', DISPLAY]); steps.push({ step: 'scaffold', ok: true }); }
    catch (e) { steps.push({ step: 'scaffold', ok: false, error: String(e.stderr ?? e.message ?? e).slice(0, 300) }); }
} else {
    steps.push({ step: 'scaffold', ok: true, note: 'already exists — reused' });
}

// 2. Connector source → Open App src/, normalizing the @RegisterClass KEY to the TS SYMBOL
//    (<ClassBase>Connector) — NOT the package name. That symbol is what validate-invariants matches
//    against Integration.ClassName, and it's what every shipped connector uses.
if (!existsSync(BUILT_CONNECTOR)) fail(`built connector not found: ${BUILT_CONNECTOR}`);
let src = readFileSync(BUILT_CONNECTOR, 'utf8');
src = src.replace(/@RegisterClass\(\s*BaseIntegrationConnector\s*,\s*['"][^'"]+['"]\s*\)/,
    `@RegisterClass(BaseIntegrationConnector, '${CLASS_NAME}')`);
const keyOk = new RegExp(`@RegisterClass\\(\\s*BaseIntegrationConnector\\s*,\\s*['"]${CLASS_NAME}['"]`).test(src);
mkdirSync(join(appDir, 'src'), { recursive: true });
writeFileSync(join(appDir, 'src', `${CLASS_NAME}.ts`), src);
steps.push({ step: 'connector', ok: keyOk, key: CLASS_NAME, ...(keyOk ? {} : { error: 'could not rewrite @RegisterClass key — check the source decorator' }) });

// 3. Metadata → Open App metadata/integration/, setting Integration.ClassName = the TS SYMBOL and
//    Integration.ImportPath = the PACKAGE name (the two are distinct — see the header invariant note).
if (!existsSync(BUILT_METADATA)) fail(`built metadata not found: ${BUILT_METADATA}`);
const meta = JSON.parse(readFileSync(BUILT_METADATA, 'utf8'));
const recs = Array.isArray(meta) ? meta : [meta];
const integ = recs.find((r) => r?.fields?.ClassName ?? r?.fields?.Name);
if (!integ) fail('no Integration record (fields.ClassName/Name) in metadata');
integ.fields.ClassName = CLASS_NAME;   // TS symbol — the @RegisterClass key, exported by this package
integ.fields.ImportPath = PKG;         // package name — packages.server[0].name
const metaDir = join(appDir, 'metadata', 'integration');
mkdirSync(metaDir, { recursive: true });
writeFileSync(join(metaDir, `.${slug}.integration.json`), JSON.stringify(recs, null, 2) + '\n');
steps.push({ step: 'metadata', ok: true, className: CLASS_NAME, importPath: PKG });

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

// 6. Changeset declaring the bump (major for a redo/breaking override, else minor/patch). The version
//    NUMBERS are not written here — `changeset version` bumps package.json from its last-released value
//    and sync-manifest-versions.mjs syncs mj-app.json; pre-bumping either would double-bump.
const changeDir = join(REPO, '.changeset');
if (existsSync(changeDir)) {
    writeFileSync(join(changeDir, `connector-${slug}.md`), `---\n"${PKG}": ${BUMP}\n---\n\n${DISPLAY} connector published as an Open App.\n`);
    steps.push({ step: 'changeset', ok: true, bump: BUMP });
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
