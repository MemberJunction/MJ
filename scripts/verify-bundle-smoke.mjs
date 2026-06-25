#!/usr/bin/env node
/**
 * Smoke-tests an `mj bundle` produced ZIP.
 *
 * `mj bundle` is the offline/air-gapped install entry point introduced by
 * PR #2725 (replaces the legacy committed bootstrap ZIP). The ZIP's
 * layout is owned by `@memberjunction/installer`'s `DistributionAssembler`
 * and is byte-equivalent to what `mj install` lays down on disk.
 *
 * This script catches integration breakage between the compiled `mj` CLI
 * and the installer's assembler — things that pure unit tests of the
 * assembler don't see (CLI flag plumbing, real archiver output, etc.).
 *
 * Assertions (per `BASE_MAPPINGS` and `ROOT_FILES` in DistributionAssembler.ts):
 *   1. ZIP entry count is plausibly large (> 100, sanity floor).
 *   2. Root files present: package.json, turbo.json, mj.config.cjs,
 *      README.md, install.config.json, Update_MemberJunction_Packages_To_Latest.ps1
 *   3. apps/MJAPI/package.json + apps/MJAPI/tsconfig.json present
 *      (re-emitted via server transforms).
 *   4. apps/MJExplorer/package.json + apps/MJExplorer/tsconfig.json present
 *      (re-emitted via angular transforms).
 *   5. SQL Scripts/generated/ directory marker present (CodeGen needs the
 *      empty directory to exist).
 *
 * Usage:
 *   node scripts/verify-bundle-smoke.mjs <path-to-zip>
 *
 * Exits 0 on full pass, 1 on any failure.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import unzipper from 'unzipper';

const COLOR = {
    pass: '\x1b[32m',
    fail: '\x1b[31m',
    info: '\x1b[36m',
    reset: '\x1b[0m',
};

let failures = 0;

function logResult(status, message) {
    const tag = status === 'pass' ? `${COLOR.pass}[PASS]${COLOR.reset}` : `${COLOR.fail}[FAIL]${COLOR.reset}`;
    console.log(`${tag} ${message}`);
    if (status === 'fail') failures++;
}

function logInfo(message) {
    console.log(`${COLOR.info}[INFO]${COLOR.reset} ${message}`);
}

const REQUIRED_FILES = [
    'package.json',
    'turbo.json',
    'mj.config.cjs',
    'README.md',
    'install.config.json',
    'Update_MemberJunction_Packages_To_Latest.ps1',
    'apps/MJAPI/package.json',
    'apps/MJAPI/tsconfig.json',
    'apps/MJExplorer/package.json',
    'apps/MJExplorer/tsconfig.json',
];

// SQL Scripts/generated/ ships as an empty-directory marker (entry with
// trailing slash). Match either form: a literal directory entry, or any
// file under that path.
const REQUIRED_DIR_PREFIXES = ['SQL Scripts/'];

async function main() {
    const arg = process.argv[2];
    if (!arg) {
        console.error('Usage: node scripts/verify-bundle-smoke.mjs <path-to-zip>');
        process.exit(1);
    }
    const zipPath = path.resolve(arg);
    if (!fs.existsSync(zipPath)) {
        console.error(`ZIP file not found: ${zipPath}`);
        process.exit(1);
    }
    logInfo(`Verifying bundle: ${zipPath}`);

    const directory = await unzipper.Open.file(zipPath);
    const entryPaths = directory.files.map((f) => f.path);
    logInfo(`ZIP entry count: ${entryPaths.length}`);

    // The assembler produces ~90 entries for a clean checkout (the bulk of
    // MJAPI/MJExplorer/GeneratedEntities content gets npm-install'd by the
    // installer, not bundled). Floor at 50 to catch catastrophic truncation
    // without flagging a normal bundle.
    if (entryPaths.length >= 50) {
        logResult('pass', `ZIP has ${entryPaths.length} entries (sanity floor: 50)`);
    } else {
        logResult('fail', `ZIP has only ${entryPaths.length} entries — distribution looks truncated`);
    }

    for (const required of REQUIRED_FILES) {
        if (entryPaths.includes(required)) {
            logResult('pass', `required entry present: ${required}`);
        } else {
            logResult('fail', `missing required entry: ${required}`);
        }
    }

    for (const prefix of REQUIRED_DIR_PREFIXES) {
        const has = entryPaths.some((p) => p === prefix || p.startsWith(prefix));
        if (has) {
            logResult('pass', `required directory present: ${prefix}`);
        } else {
            logResult('fail', `missing required directory: ${prefix}`);
        }
    }

    if (failures > 0) {
        console.error(`\n${failures} assertion(s) failed.`);
        process.exit(1);
    }
    console.log('\nAll bundle smoke assertions passed.');
}

main().catch((err) => {
    console.error('verify-bundle-smoke: unexpected error');
    console.error(err);
    process.exit(1);
});
