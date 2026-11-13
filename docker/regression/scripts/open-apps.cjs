/**
 * Installs the Open Apps pinned in docker/regression/open-apps.json, one step at a time:
 *
 *   node open-apps.cjs packages          Image build (no database). Builds the MJ CLI (concurrency 2,
 *                                        as the test-runner image needs), points every workspace
 *                                        @memberjunction package at its workspace copy, runs
 *                                        `mj app install <repo> --version <v> --packages-only` for
 *                                        each app, turns off the client packages that an entry's
 *                                        `disableClientPackages` names, builds the workspace packages
 *                                        that the installed app packages use, then fails if a
 *                                        workspace @memberjunction package now also has a registry
 *                                        copy.
 *   node open-apps.cjs database          db-setup (database up). Applies the `mjCompat` changes that an
 *                                        entry names, then runs `--database-only` for each app.
 *   node open-apps.cjs check-duplicates  Only the duplicate check.
 *
 * Every install runs with `--non-interactive`. An empty list does nothing.
 *
 * GITHUB_TOKEN comes from the environment or, in an image build, from the BuildKit secret
 * `github_token` (/run/secrets/github_token). An empty token is removed, so public repos install
 * without one.
 *
 * Run from the repo root (/app in the images).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const LIST_PATH = process.env.OPEN_APPS_FILE || path.resolve(__dirname, '..', 'open-apps.json');
const SECRET_PATH = '/run/secrets/github_token';
const MJ_CLI = 'packages/MJCLI/bin/run.js';
const ROOT_MANIFEST = 'package.json';
const CONFIG_PATH = 'mj.config.cjs';
const PNPM_STORE = 'node_modules/.pnpm';
const MJ_CORE_SCHEMA = '__mj';
/** Database changes an entry can ask for, so an app built for an older MJ installs. */
const MJ_COMPAT = ['legacy-conversation-type'];

/** Reads and checks the pinned list: an array of { repo, version, disableClientPackages?, mjCompat? }. */
function readAppList() {
    const apps = JSON.parse(fs.readFileSync(LIST_PATH, 'utf8'));
    if (!Array.isArray(apps)) throw new Error(`${LIST_PATH} must hold a JSON array`);
    for (const app of apps) {
        if (typeof app.repo !== 'string' || !app.repo.startsWith('https://')) {
            throw new Error(`Each entry in ${LIST_PATH} needs an https "repo": ${JSON.stringify(app)}`);
        }
        if (typeof app.version !== 'string' || app.version.length === 0) {
            throw new Error(`Each entry in ${LIST_PATH} needs a "version": ${JSON.stringify(app)}`);
        }
        const off = app.disableClientPackages ?? [];
        if (!Array.isArray(off) || off.some((name) => typeof name !== 'string')) {
            throw new Error(`"disableClientPackages" in ${LIST_PATH} must be an array of package names: ${JSON.stringify(app)}`);
        }
        const compat = app.mjCompat ?? [];
        if (!Array.isArray(compat) || compat.some((name) => !MJ_COMPAT.includes(name))) {
            throw new Error(`"mjCompat" in ${LIST_PATH} must be an array of ${MJ_COMPAT.join(', ')}: ${JSON.stringify(app)}`);
        }
    }
    return apps;
}

/** The environment for child processes, with GITHUB_TOKEN from the env or the build secret. */
function childEnv() {
    const env = { ...process.env };
    let token = (env.GITHUB_TOKEN || '').trim();
    if (!token && fs.existsSync(SECRET_PATH)) token = fs.readFileSync(SECRET_PATH, 'utf8').trim();
    if (token) env.GITHUB_TOKEN = token;
    else delete env.GITHUB_TOKEN;
    return env;
}

/** Runs a command with inherited output and exits the process when it fails. */
function run(command, args, env) {
    console.log(`$ ${command} ${args.join(' ')}`);
    const result = spawnSync(command, args, { stdio: 'inherit', env });
    if (result.status !== 0) {
        console.error(`Failed (exit ${result.status ?? result.signal}): ${command} ${args.join(' ')}`);
        process.exit(result.status || 1);
    }
}

/** Runs `mj app install` with the given step flag for every pinned app. */
function installAll(apps, stepFlag, env) {
    for (const app of apps) {
        run('node', [MJ_CLI, 'app', 'install', app.repo, '--version', app.version, stepFlag, '--non-interactive'], env);
    }
}

/** Names of the @memberjunction packages in the workspace (packages/**, no node_modules). */
function workspacePackageNames(dir = 'packages', depth = 0, names = new Set()) {
    if (depth > 5) return names;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const child = path.join(dir, entry.name);
        const manifest = path.join(child, 'package.json');
        if (fs.existsSync(manifest)) {
            const name = JSON.parse(fs.readFileSync(manifest, 'utf8')).name;
            if (typeof name === 'string' && name.startsWith('@memberjunction/')) names.add(name);
        }
        workspacePackageNames(child, depth + 1, names);
    }
    return names;
}

/**
 * Adds a `workspace:*` entry to the root `pnpm.overrides` for every workspace @memberjunction
 * package, so the apps' dependencies and peers on those packages link to the workspace. App
 * packages declare ranges such as `^6.1.2`, which a prerelease workspace version does not match.
 */
function linkWorkspacePackages() {
    const manifest = JSON.parse(fs.readFileSync(ROOT_MANIFEST, 'utf8'));
    const names = [...workspacePackageNames()].sort();
    const pnpmSettings = manifest.pnpm || {};
    const overrides = { ...(pnpmSettings.overrides || {}) };
    for (const name of names) overrides[name] = 'workspace:*';
    manifest.pnpm = { ...pnpmSettings, overrides };
    fs.writeFileSync(ROOT_MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Linked the ${names.length} workspace @memberjunction packages for the app install (pnpm.overrides).`);
}

/** The `[` … `]` span of the `dynamicPackages.client` array in mj.config.cjs, or null. */
function clientArraySpan(text) {
    const section = /dynamicPackages\s*:\s*\{/.exec(text);
    if (!section) return null;
    const key = /\bclient\s*:\s*\[/g;
    key.lastIndex = section.index;
    const match = key.exec(text);
    if (!match) return null;
    const start = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        if (text[i] === '[') depth++;
        else if (text[i] === ']' && --depth === 0) return { start, end: i + 1 };
    }
    return null;
}

/**
 * Sets `Enabled: false` on the named `dynamicPackages.client` entries in mj.config.cjs, so the
 * Explorer manifest emits them as comments. Fails when a name has no client entry.
 */
function disableClientPackages(names) {
    if (names.length === 0) return;
    let text = fs.readFileSync(CONFIG_PATH, 'utf8');
    const span = clientArraySpan(text);
    if (!span) throw new Error(`${CONFIG_PATH} has no dynamicPackages.client array`);
    let client = text.slice(span.start, span.end);
    for (const name of names) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
        const entry = new RegExp(`(PackageName:\\s*["']${escaped}["'][^{}]*?Enabled:\\s*)(true|false)`);
        if (!entry.test(client)) throw new Error(`disableClientPackages: ${name} has no client entry in ${CONFIG_PATH}`);
        client = client.replace(entry, '$1false');
    }
    text = text.slice(0, span.start) + client + text.slice(span.end);
    fs.writeFileSync(CONFIG_PATH, text);
    console.log(`Turned off ${names.length} Open App client package(s): ${names.join(', ')}`);
}

/** The package name of a node_modules/.pnpm folder name (`@scope+name@1.0.0_x` → `@scope/name`). */
function storeFolderPackage(folder) {
    const scoped = folder.startsWith('@');
    const at = folder.indexOf('@', scoped ? 1 : 0);
    const name = at === -1 ? folder : folder.slice(0, at);
    return scoped ? name.replace('+', '/') : name;
}

/** Workspace @memberjunction packages that a registry package (an app package) depends on. */
function workspacePackagesUsedByApps(workspace) {
    const used = new Set();
    for (const folder of fs.readdirSync(PNPM_STORE)) {
        if (folder.startsWith('@memberjunction+') || folder === 'node_modules' || folder.startsWith('.')) continue;
        const manifestPath = path.join(PNPM_STORE, folder, 'node_modules', storeFolderPackage(folder), 'package.json');
        if (!fs.existsSync(manifestPath)) continue;
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        for (const name of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
            if (workspace.has(name)) used.add(name);
        }
    }
    return [...used].sort();
}

/**
 * Builds the workspace packages that the installed app packages use. The image build only builds
 * what MJAPI and MJExplorer depend on, and turbo does not see an app package's dependencies.
 */
function buildWorkspacePackagesUsedByApps(env) {
    const names = workspacePackagesUsedByApps(workspacePackageNames());
    if (names.length === 0) return;
    console.log(`Building the ${names.length} workspace packages that the app packages use.`);
    run('pnpm', ['exec', 'turbo', 'build', '--concurrency=2', ...names.map((name) => `--filter=${name}`)], env);
}

/**
 * Fails when node_modules/.pnpm holds a registry copy (`@memberjunction+<name>@<version>…`) of a
 * workspace package. Workspace packages are linked, so any such entry is a second copy.
 */
function checkDuplicates() {
    const workspace = workspacePackageNames();
    const store = fs.existsSync('node_modules/.pnpm') ? fs.readdirSync('node_modules/.pnpm') : [];
    const duplicates = store
        .filter((dir) => dir.startsWith('@memberjunction+'))
        .filter((dir) => workspace.has(`@memberjunction/${dir.slice('@memberjunction+'.length).split('@')[0]}`));
    if (duplicates.length > 0) {
        console.error('A workspace @memberjunction package also has a registry copy in this image:');
        for (const dir of duplicates) console.error(`  node_modules/.pnpm/${dir}`);
        console.error('Run `pnpm why <package>` in the image to see which Open App package pulls it in.');
        process.exit(1);
    }
    console.log(`No registry copies of the ${workspace.size} workspace @memberjunction packages.`);
}

/**
 * Applies the `mjCompat` changes that the entries name. `legacy-conversation-type` lets the
 * conversation procedures accept the `@Type` name that apps built before MJ 6.3 pass.
 */
async function applyCompat(apps) {
    const names = [...new Set(apps.flatMap((app) => app.mjCompat ?? []))];
    if (!names.includes('legacy-conversation-type')) return;
    const { connect } = require('./lib/db.cjs');
    const { ApplyLegacyConversationType } = require('./lib/legacy-conversation-type.cjs');
    const pool = await connect();
    try {
        const changed = await ApplyLegacyConversationType(pool, MJ_CORE_SCHEMA);
        console.log(`mjCompat legacy-conversation-type: ${changed.length ? `added @Type to ${changed.join(', ')}` : 'not needed'}`);
    } finally {
        await pool.close();
    }
}

async function main() {
    const step = process.argv[2];
    if (step === 'check-duplicates') return checkDuplicates();
    if (step !== 'packages' && step !== 'database') {
        console.error('Usage: node open-apps.cjs packages|database|check-duplicates');
        process.exit(2);
    }
    const apps = readAppList();
    if (apps.length === 0) {
        console.log(`No Open Apps in ${LIST_PATH}; nothing to install.`);
        return;
    }
    const env = childEnv();
    if (step === 'packages') {
        run('pnpm', ['exec', 'turbo', 'build', '--concurrency=2', '--filter=@memberjunction/cli'], env);
        linkWorkspacePackages();
        installAll(apps, '--packages-only', env);
        disableClientPackages(apps.flatMap((app) => app.disableClientPackages ?? []));
        buildWorkspacePackagesUsedByApps(env);
        checkDuplicates();
    } else {
        await applyCompat(apps);
        installAll(apps, '--database-only', env);
    }
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
