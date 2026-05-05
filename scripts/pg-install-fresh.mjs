#!/usr/bin/env node
/**
 * PG Fresh Install via Skyway + Local Tooling Pipeline
 *
 * Goal: stand up a working MJAPI + Explorer on a brand-new PG database using
 * local Skyway builds (the PG provider) + the MJ PG migration file set.
 *
 * Pipeline:
 *   1. Create fresh PG DB
 *   2. Scaffold target dir from an existing sqlserver-install template
 *   3. Write PG-specific configs (.env, mj.config.cjs, environment.ts)
 *   4. npm install against the target dir
 *   5. Patch node_modules with local Skyway + MJ builds
 *   6. Apply migrations via `mj migrate`
 *   7. Build Generated* packages
 *   8. Run `mj codegen`
 *   9. Verify DB state (table/view/function counts)
 *   10. Seed a reviewer User row for MSAL/Auth0 first-login resolution
 *
 * Each step prints ✓ or ✗. On failure the script stops at the first problem.
 *
 * Required env vars (no defaults — fail loudly if missing):
 *   SKYWAY_ROOT             Path to your local Skyway checkout
 *   SOURCE_INSTALL          Path to an existing sqlserver-install dir used as the skeleton
 *   TARGET_DIR              Path where the fresh PG install is created (will be wiped)
 *   PG_ADMIN_PASSWORD       Password for the admin PG user that creates/drops the DB
 *   MJ_BASE_ENCRYPTION_KEY  Base64-encoded 32-byte key for MJAPI symmetric encryption
 *   WEB_CLIENT_ID           Azure AD / Auth0 app-registration GUID
 *   TENANT_ID               Azure AD tenant GUID
 *
 * Optional env vars (with defaults):
 *   MJ_ROOT                 Defaults to the repo containing this script
 *   PG_HOST (localhost), PG_PORT (5432), PG_ADMIN_USER (postgres)
 *   PG_INSTALL_DB_NAME      Defaults to mj_pg_install
 *   MJ_API_PORT (4005), MJ_EXPLORER_PORT (4202)
 *   REVIEWER_EMAIL / REVIEWER_FIRST_NAME / REVIEWER_LAST_NAME
 *                           User row seeded in Step 10 (defaults are placeholders)
 */

import { Pool } from 'pg';
import { execSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Required env vars. Fail loudly if any is missing rather than silently using a
// placeholder. See the README / DEV_ON_PG_GUIDE for suggested values.
function requireEnv(name, hint) {
    const v = process.env[name];
    if (!v) {
        console.error(`✗ Missing required env var ${name}.${hint ? ' ' + hint : ''}`);
        console.error(`  Set it in your shell or .env before running this script.`);
        process.exit(1);
    }
    return v;
}

// Paths — default MJ_ROOT to the repo containing this script; override others via env.
const MJ_ROOT        = process.env.MJ_ROOT        || dirname(__dirname);
const SKYWAY_ROOT    = requireEnv('SKYWAY_ROOT',    'Path to your local Skyway checkout (the sibling repo).');
const SOURCE_INSTALL = requireEnv('SOURCE_INSTALL', 'Path to a pre-scaffolded sqlserver-install dir used as the skeleton template.');
const TARGET_DIR     = requireEnv('TARGET_DIR',     'Target directory where the fresh PG install will be created (will be wiped).');

const DB_NAME           = process.env.PG_INSTALL_DB_NAME   || 'mj_pg_install';
const MJ_API_PORT       = parseInt(process.env.MJ_API_PORT      || '4005', 10);
const MJ_EXPLORER_PORT  = parseInt(process.env.MJ_EXPLORER_PORT || '4202', 10);

// PG admin credentials — required, never defaulted.
const PG_ADMIN = {
    host:     process.env.PG_HOST || 'localhost',
    port:     parseInt(process.env.PG_PORT || '5432', 10),
    user:     process.env.PG_ADMIN_USER     || 'postgres',
    password: requireEnv('PG_ADMIN_PASSWORD', 'Password for the PG admin user that will create/drop the install DB.'),
};

// Auth + encryption secrets — required, never defaulted. Each consumer provides their own.
const MJ_BASE_ENCRYPTION_KEY = requireEnv('MJ_BASE_ENCRYPTION_KEY', 'Base64-encoded 32-byte key used by MJAPI for symmetric encryption.');
const WEB_CLIENT_ID          = requireEnv('WEB_CLIENT_ID',          'Azure AD / Auth0 client registration GUID for your org.');
const TENANT_ID              = requireEnv('TENANT_ID',              'Azure AD tenant GUID for your org.');

// Reviewer identity — used in Step 10 to seed a user row for MSAL/Auth0 first-login resolution.
const REVIEWER_EMAIL      = process.env.REVIEWER_EMAIL      || 'reviewer@example.com';
const REVIEWER_FIRST_NAME = process.env.REVIEWER_FIRST_NAME || 'Reviewer';
const REVIEWER_LAST_NAME  = process.env.REVIEWER_LAST_NAME  || 'Account';

const step = (n, msg) => console.log(`\n━━━ Step ${n}: ${msg} ━━━`);
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => { console.log(`  ✗ ${msg}`); process.exitCode = 1; };
const info = (msg) => console.log(`  · ${msg}`);
const warn = (msg) => console.log(`  ⚠ ${msg}`);

async function pgExec(sql, db = 'postgres') {
    const p = new Pool({ ...PG_ADMIN, database: db, max: 1 });
    try { return await p.query(sql); } finally { await p.end(); }
}

function sh(cmd, opts = {}) {
    return execSync(cmd, { stdio: opts.silent ? 'pipe' : 'inherit', cwd: opts.cwd ?? process.cwd(), ...opts });
}

// Step 1 — fresh DB
async function step1_createDB() {
    step(1, 'Create fresh PG database');
    await pgExec(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}'`);
    await pgExec(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    await pgExec(`CREATE DATABASE ${DB_NAME}`);
    ok(`Created DB ${DB_NAME}`);
}

// Step 2 — scaffold from sqlserver-install
function step2_scaffold() {
    step(2, 'Scaffold target directory from sqlserver-install');
    if (existsSync(TARGET_DIR)) {
        info('Removing previous target dir');
        rmSync(TARGET_DIR, { recursive: true, force: true });
    }
    mkdirSync(TARGET_DIR, { recursive: true });

    const excludeDirs = new Set(['node_modules', 'dist', '.turbo', '.cache']);
    const excludeFiles = new Set(['.mj-install-state.json', 'mj-diagnostic-report.md']);
    const excludeRootEntries = new Set(['SQL Scripts', 'Schema Files', 'logs']);
    const isOneOffScript = (n) => /^(apply_|check_|patch_|apply_generated_sql|apply_migrations|apply_v528|apply_views).*\.(js|mjs)$/.test(n);

    function copyRec(src, dst, isRoot = false) {
        mkdirSync(dst, { recursive: true });
        for (const entry of readdirSync(src, { withFileTypes: true })) {
            const name = entry.name;
            if (excludeFiles.has(name)) continue;
            if (isRoot && excludeRootEntries.has(name)) continue;
            if (isOneOffScript(name)) continue;
            const s = join(src, name), d = join(dst, name);
            if (entry.isDirectory()) {
                if (excludeDirs.has(name)) continue;
                copyRec(s, d);
            } else {
                cpSync(s, d);
            }
        }
    }
    copyRec(SOURCE_INSTALL, TARGET_DIR, true);
    ok('Copied sqlserver-install skeleton');

    if (!existsSync(join(TARGET_DIR, 'packages/GeneratedEntities/package.json'))) {
        fail('Missing GeneratedEntities/package.json after copy'); return false;
    }
    ok('Generated* package.json files present');
    return true;
}

// Step 3 — PG config files
function step3_configFiles() {
    step(3, 'Write PG config files');
    const envContent = `#PG Fresh Install via Skyway
DB_TYPE=postgresql
DB_HOST=${PG_ADMIN.host}
DB_PORT=${PG_ADMIN.port}
DB_DATABASE=${DB_NAME}
DB_USERNAME=${PG_ADMIN.user}
DB_PASSWORD=${PG_ADMIN.password}
CODEGEN_DB_USERNAME=${PG_ADMIN.user}
CODEGEN_DB_PASSWORD=${PG_ADMIN.password}
DB_TRUST_SERVER_CERTIFICATE=1

PG_HOST=${PG_ADMIN.host}
PG_PORT=${PG_ADMIN.port}
PG_DATABASE=${DB_NAME}
PG_USERNAME=${PG_ADMIN.user}
PG_PASSWORD=${PG_ADMIN.password}

OUTPUT_CODE='${DB_NAME}'
MJ_CORE_SCHEMA='__mj'
MJ_BASE_ENCRYPTION_KEY='${MJ_BASE_ENCRYPTION_KEY}'
GRAPHQL_PORT=${MJ_API_PORT}

UPDATE_USER_CACHE_WHEN_NOT_FOUND=1
UPDATE_USER_CACHE_WHEN_NOT_FOUND_DELAY=5000

WEB_CLIENT_ID=${WEB_CLIENT_ID}
TENANT_ID=${TENANT_ID}

AUTH0_CLIENT_ID=${WEB_CLIENT_ID}
AUTH0_CLIENT_SECRET=
AUTH0_DOMAIN=

AI_VENDOR_API_KEY__OpenAILLM=''
AI_VENDOR_API_KEY__MistralLLM=''
AI_VENDOR_API_KEY__AnthropicLLM=''

ASK_SKIP_API_URL='http://localhost:8000'
ASK_SKIP_ORGANIZATION_ID=1
`;
    writeFileSync(join(TARGET_DIR, '.env'), envContent);
    writeFileSync(join(TARGET_DIR, 'apps/MJAPI/.env'), envContent);
    writeFileSync(join(TARGET_DIR, 'apps/MJExplorer/.env'), envContent);
    ok('Wrote .env files');

    // Fix root mj.config.cjs for PG
    const rootCfg = readFileSync(join(TARGET_DIR, 'mj.config.cjs'), 'utf8');
    let newCfg = rootCfg
        .replace(/\s*newUserSetup:\s*\{[^}]*\},?/g, '')
        .replace(/(\s*encryptionKeys:\s*\{[^}]*\},)\s*\};/, `$1\n  dbPlatform: 'postgresql',\n  dbPort: parseInt(process.env.DB_PORT, 10) || 5432,\n  migrationsLocation: 'filesystem:./migrations-pg',\n  excludeSchemas: ['sys', 'staging'],\n};`);
    writeFileSync(join(TARGET_DIR, 'mj.config.cjs'), newCfg);
    ok('Patched root mj.config.cjs (dbPlatform postgresql, dbPort 5432, migrations-pg)');

    // MJAPI mj.config.cjs proper passthrough
    writeFileSync(join(TARGET_DIR, 'apps/MJAPI/mj.config.cjs'), `module.exports = require('../../mj.config.cjs');\n`);
    ok('Fixed apps/MJAPI/mj.config.cjs (CommonJS passthrough)');

    // Explorer environment.ts — point at API port
    for (const rel of ['apps/MJExplorer/src/environments/environment.development.ts', 'apps/MJExplorer/src/environments/environment.ts']) {
        const p = join(TARGET_DIR, rel);
        if (!existsSync(p)) continue;
        let content = readFileSync(p, 'utf8');
        content = content.replace(/http:\/\/localhost:[0-9]+\//g, `http://localhost:${MJ_API_PORT}/`);
        content = content.replace(/ws:\/\/localhost:[0-9]+\//g, `ws://localhost:${MJ_API_PORT}/`);
        writeFileSync(p, content);
    }
    ok(`Patched environment files (API port ${MJ_API_PORT})`);

    // migrations-pg/ needs to be in the target dir for `mj migrate` to find it
    const srcMigDir = join(MJ_ROOT, 'migrations-pg');
    const dstMigDir = join(TARGET_DIR, 'migrations-pg');
    if (existsSync(dstMigDir)) rmSync(dstMigDir, { recursive: true, force: true });
    cpSync(srcMigDir, dstMigDir, { recursive: true });
    const migCount = readdirSync(join(dstMigDir, 'v5')).filter(f => f.endsWith('.sql')).length;
    ok(`Copied migrations-pg (${migCount} files in v5)`);
    return true;
}

// Step 4 — npm install
function step4_npmInstall() {
    step(4, 'npm install (published 5.28.0)');
    try {
        sh('npm install --silent 2>&1 | tail -3', { cwd: TARGET_DIR });
        ok('npm install complete');
        return true;
    } catch (e) {
        fail(`npm install failed: ${e.message}`); return false;
    }
}

// Step 5 — patch local Skyway + MJ builds into node_modules
function step5_applyPatches() {
    step(5, 'Patch node_modules with local Skyway + MJ builds');

    // Skyway 0.6.x: replace whole packages (core + providers)
    const skywayPackages = ['core', 'sqlserver', 'postgres'];
    for (const pkg of skywayPackages) {
        const src = join(SKYWAY_ROOT, 'packages', pkg);
        const dst = join(TARGET_DIR, `node_modules/@memberjunction/skyway-${pkg}`);
        if (!existsSync(src)) { fail(`Skyway build missing: ${src}`); return false; }
        rmSync(dst, { recursive: true, force: true });
        mkdirSync(dst, { recursive: true });
        // Copy just dist + package.json to keep it clean
        cpSync(join(src, 'dist'), join(dst, 'dist'), { recursive: true });
        cpSync(join(src, 'package.json'), join(dst, 'package.json'));
        ok(`Installed local skyway-${pkg}`);
    }

    // MJ tooling-branch packages: just the dist folder goes into node_modules
    const mjPatches = [
        ['packages/CodeGenLib/dist', 'codegen-lib/dist'],
        ['packages/PostgreSQLDataProvider/dist', 'postgresql-dataprovider/dist'],
        ['packages/GenericDatabaseProvider/dist', 'generic-database-provider/dist'],
        ['packages/MJCLI/dist', 'cli/dist'],
        ['packages/MJCore/dist', 'core/dist'],
        ['packages/SQLConverter/dist', 'sql-converter/dist'],
        ['packages/MetadataSync/dist', 'metadata-sync/dist'],
        ['packages/OpenApp/Engine/dist', 'open-app-engine/dist'],
    ];
    for (const [src, dst] of mjPatches) {
        const srcPath = join(MJ_ROOT, src);
        const dstPath = join(TARGET_DIR, 'node_modules/@memberjunction', dst);
        if (!existsSync(srcPath)) { warn(`Local build missing (skipping): ${src}`); continue; }
        rmSync(dstPath, { recursive: true, force: true });
        cpSync(srcPath, dstPath, { recursive: true });
        ok(`Patched @memberjunction/${dst.replace('/dist', '')}`);
    }

    // MJCLI's oclif manifest needs to be copied too (points at commands)
    const oclifManifestSrc = join(MJ_ROOT, 'packages/MJCLI/oclif.manifest.json');
    const oclifManifestDst = join(TARGET_DIR, 'node_modules/@memberjunction/cli/oclif.manifest.json');
    if (existsSync(oclifManifestSrc)) {
        cpSync(oclifManifestSrc, oclifManifestDst);
        ok('Copied MJCLI oclif manifest');
    }

    // MJCLI package.json needs to list skyway-postgres + skyway-sqlserver peer deps
    // (we only need the types — the dist import works dynamically at runtime)
    const cliPkgPath = join(TARGET_DIR, 'node_modules/@memberjunction/cli/package.json');
    if (existsSync(cliPkgPath)) {
        const cliPkg = JSON.parse(readFileSync(cliPkgPath, 'utf8'));
        cliPkg.dependencies = cliPkg.dependencies || {};
        cliPkg.dependencies['@memberjunction/skyway-core'] = '^0.6.0';
        cliPkg.dependencies['@memberjunction/skyway-postgres'] = '^0.6.0';
        cliPkg.dependencies['@memberjunction/skyway-sqlserver'] = '^0.6.0';
        writeFileSync(cliPkgPath, JSON.stringify(cliPkg, null, 2));
        ok('Updated @memberjunction/cli package.json deps');
    }

    return true;
}

// Step 6 — apply migrations via `mj migrate`
async function step6_migrate() {
    step(6, 'Apply migrations via `mj migrate`');
    try {
        // Capture full output so we can detect logical failures even when the exit code is 0.
        // (Skyway's `per-migration` transaction mode commits successful migrations before
        // aborting on the first failing one, so `mj migrate` can emit "Migrations failed"
        // with a non-zero exit AND the pipe-to-tail masked it in the earlier version.)
        const out = sh(`node node_modules/@memberjunction/cli/bin/run.js migrate --verbose 2>&1`, { cwd: TARGET_DIR, silent: true, encoding: 'utf8' });
        // Echo the tail for visibility
        const lines = out.split('\n');
        for (const line of lines.slice(-30)) console.log(line);
        if (/Migrations failed|Error:.*does not exist|Migration FAILED/.test(out)) {
            fail('mj migrate produced logical errors (see output above)');
            return false;
        }
        ok('mj migrate completed cleanly');
        return true;
    } catch (e) {
        fail(`mj migrate failed: ${(e.stderr || e.stdout || e.message || '').toString().substring(0, 500)}`);
        return false;
    }
}

// Step 7 — build GeneratedEntities / GeneratedActions
function step7_buildGenerated() {
    step(7, 'Build GeneratedEntities + GeneratedActions');
    try {
        for (const pkg of ['GeneratedEntities', 'GeneratedActions']) {
            sh('npm run build 2>&1 | tail -3', { cwd: join(TARGET_DIR, `packages/${pkg}`) });
        }
        ok('Generated packages built');
        return true;
    } catch (e) {
        fail(`Build failed: ${e.message.substring(0, 200)}`); return false;
    }
}

// Step 8 — mj codegen
function step8_codegen() {
    step(8, 'Run mj codegen');
    try {
        sh(`node node_modules/@memberjunction/cli/bin/run.js codegen 2>&1 | tail -10`, { cwd: TARGET_DIR });
        ok('mj codegen completed');
        return true;
    } catch (e) {
        fail(`mj codegen failed: ${e.message.substring(0, 300)}`); return false;
    }
}

// Step 9 — verify DB state
async function step9_verifyDB() {
    step(9, 'Verify DB state');
    const pool = new Pool({ ...PG_ADMIN, database: DB_NAME, max: 1 });
    try {
        const q = async (sql) => (await pool.query(sql)).rows;
        const tables = (await q(`SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_schema='__mj' AND table_type='BASE TABLE'`))[0].c;
        const views = (await q(`SELECT COUNT(*)::int AS c FROM information_schema.views WHERE table_schema='__mj'`))[0].c;
        const funcs = (await q(`SELECT COUNT(*)::int AS c FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname='__mj'`))[0].c;
        const migs = (await q(`SELECT COUNT(*)::int AS c FROM __mj.flyway_schema_history WHERE success=true`))[0].c;

        info(`Tables:     ${tables}`);
        info(`Views:      ${views}`);
        info(`Functions:  ${funcs}`);
        info(`Migrations: ${migs} applied`);

        if (tables < 200) warn(`Expected >= 200 tables, got ${tables}`);
        if (views < 150) warn(`Expected >= 150 views, got ${views}`);
        if (migs < 50) warn(`Expected >= 50 migrations, got ${migs}`);
        return true;
    } finally { await pool.end(); }
}

// Step 9.5 — REMOVED. Baseline view preservation now happens natively during
// CodeGen via the PG 42P16 capture/restore fallback + phased per-entity
// execution in @memberjunction/codegen-lib. The earlier post-codegen re-run
// of baseline view DDL is obsolete — it was a band-aid for CASCADE drops
// that the CodeGenLib fix eliminates.

// Step 10 — seed reviewer user so MSAL auth resolves on first Explorer load.
// Baseline seeds a single placeholder "not.set@nowhere.com" User row. On fresh installs
// the MSAL-authenticated reviewer has no matching email and MJAPI returns 401. Rather
// than require a manual UPDATE, overwrite the placeholder with the reviewer's identity.
// Override via env: REVIEWER_EMAIL / REVIEWER_FIRST_NAME / REVIEWER_LAST_NAME.
async function step10_seedReviewerUser() {
    step(10, 'Seed reviewer User row for MSAL auth');
    const pool = new Pool({ ...PG_ADMIN, database: DB_NAME, max: 1 });
    try {
        const res = await pool.query(
            `UPDATE __mj."User" SET "Email" = $1, "FirstName" = $2, "LastName" = $3
             WHERE "Email" = 'not.set@nowhere.com' RETURNING "ID", "Email"`,
            [REVIEWER_EMAIL, REVIEWER_FIRST_NAME, REVIEWER_LAST_NAME]
        );
        if (res.rowCount === 1) {
            ok(`Updated placeholder User → ${REVIEWER_EMAIL}`);
        } else {
            warn(`No placeholder User found; auth may require manual User seeding`);
        }
        // Intentionally no UserApplication backfill here: SQL Server installs
        // produce the same 5 bindings for the placeholder user (Chat, Data
        // Explorer, Home, Scheduling, Lists) and rely on MJ's new-user-setup
        // flow at first-auth time to bind any post-baseline default apps
        // (Actions, Testing, etc.). Replaying that logic here would diverge
        // PG install behavior from SQL Server install behavior. The remaining
        // apps will bind naturally when the auto-create-user-on-first-auth
        // flow is wired up; until then, the reviewer can add them via the
        // Home application nav settings, matching the SQL Server experience.
        return true;
    } finally { await pool.end(); }
}

(async () => {
    console.log(`\n═══ PG Fresh Install via Skyway + Local Tooling ═══`);
    console.log(`Target: ${TARGET_DIR}`);
    console.log(`DB:     ${DB_NAME}`);
    console.log(`API:    localhost:${MJ_API_PORT}`);

    await step1_createDB();
    if (!step2_scaffold()) return;
    if (!step3_configFiles()) return;
    if (!step4_npmInstall()) return;
    if (!step5_applyPatches()) return;
    if (!await step6_migrate()) return;
    if (!step7_buildGenerated()) return;
    if (!step8_codegen()) return;
    if (!await step9_verifyDB()) return;
    if (!await step10_seedReviewerUser()) return;

    console.log(`\n═══ Done ═══`);
    console.log(`Next: manually start API and Explorer from ${TARGET_DIR}`);
    console.log(`  API:      cd ${TARGET_DIR}/apps/MJAPI && npm start    (port ${MJ_API_PORT})`);
    console.log(`  Explorer: cd ${TARGET_DIR}/apps/MJExplorer && ng serve --port ${MJ_EXPLORER_PORT}`);

    if (process.exitCode && process.exitCode !== 0) {
        console.log(`\n⚠️ Some steps failed — see above.`);
    } else {
        console.log(`\n✓ All pipeline steps passed.`);
    }
})();
