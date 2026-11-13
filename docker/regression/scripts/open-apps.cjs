/**
 * Installs the Open Apps pinned in docker/regression/open-apps.json, one step at a time:
 *
 *   node open-apps.cjs packages          Image build (no database). Builds the MJ CLI (concurrency 2,
 *                                        as the test-runner image needs), runs
 *                                        `mj app install <repo> --version <v> --packages-only` for
 *                                        each app, then fails if a workspace @memberjunction package
 *                                        now also has a registry copy.
 *   node open-apps.cjs database          db-setup (database up). Runs `--database-only` for each app.
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

/** Reads and checks the pinned list: an array of { repo, version }. */
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

function main() {
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
        installAll(apps, '--packages-only', env);
        checkDuplicates();
    } else {
        installAll(apps, '--database-only', env);
    }
}

main();
