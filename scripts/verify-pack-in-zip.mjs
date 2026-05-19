#!/usr/bin/env node
/**
 * Verifies that an MJ bootstrap ZIP correctly ships the Claude pack.
 *
 * Per plan §11.3, runs these assertions after extracting the ZIP:
 *   1. CLAUDE.md exists
 *   2. .claude/mj/VERSION exists
 *   3. .claude/settings.json exists
 *   4. .claude/mj/VERSION matches the source PACK_VERSION file
 *   5. .claude/mj/MANIFEST.json sha256 hashes match the extracted file bytes
 *      (catches any corruption during archive.glob → zip → unzip round trip)
 *
 * Plus an implicit sixth: MANIFEST.json itself parses as valid JSON and
 * has the expected shape.
 *
 * Usage:
 *   node scripts/verify-pack-in-zip.mjs [path-to-zip]
 *
 * If no ZIP path is given, reads `CreateMJDistribution.log` (which the
 * release pipeline writes with the produced filename) and uses that.
 *
 * Exits 0 on full pass, 1 on any failure. Prints clear per-assertion
 * pass/fail lines.
 */

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import unzipper from 'unzipper';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

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

function resolveZipPath() {
    const arg = process.argv[2];
    if (arg) return path.resolve(arg);

    const logPath = path.join(REPO_ROOT, 'CreateMJDistribution.log');
    if (!fs.existsSync(logPath)) {
        console.error(`No ZIP path given and ${logPath} does not exist.`);
        console.error('Run `node CreateMJDistribution.js` first, or pass the ZIP path explicitly.');
        process.exit(1);
    }
    const recorded = fs.readFileSync(logPath, 'utf-8').trim();
    return path.isAbsolute(recorded) ? recorded : path.resolve(REPO_ROOT, recorded);
}

function readSourcePackVersion() {
    // Pick the highest v{N}/ that has a PACK_VERSION (mirrors CreateMJDistribution.js's selection)
    const versionsRoot = path.join(REPO_ROOT, 'templates', 'claude-pack', 'versions');
    const majorDirs = fs.readdirSync(versionsRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory() && /^v\d+$/.test(e.name))
        .map((e) => e.name)
        .sort((a, b) => parseInt(b.slice(1), 10) - parseInt(a.slice(1), 10));
    if (majorDirs.length === 0) {
        throw new Error(`No v{N}/ folders found in ${versionsRoot}`);
    }
    const versionFile = path.join(versionsRoot, majorDirs[0], 'PACK_VERSION');
    return {
        major: majorDirs[0],
        packVersion: fs.readFileSync(versionFile, 'utf-8').trim(),
    };
}

async function extractZip(zipPath, extractDir) {
    const directory = await unzipper.Open.file(zipPath);
    for (const entry of directory.files) {
        if (entry.type !== 'File') continue;
        const outPath = path.join(extractDir, entry.path);
        await fsPromises.mkdir(path.dirname(outPath), { recursive: true });
        await new Promise((resolve, reject) => {
            entry.stream()
                .pipe(fs.createWriteStream(outPath))
                .on('finish', resolve)
                .on('error', reject);
        });
    }
}

async function computeSha256(filePath) {
    const buf = await fsPromises.readFile(filePath);
    return createHash('sha256').update(buf).digest('hex');
}

async function main() {
    const zipPath = resolveZipPath();
    if (!fs.existsSync(zipPath)) {
        console.error(`ZIP file not found: ${zipPath}`);
        process.exit(1);
    }
    logInfo(`Verifying pack in: ${zipPath}`);

    const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'verify-pack-'));
    try {
        await extractZip(zipPath, tmpDir);
        logInfo(`Extracted to: ${tmpDir}`);

        // Assertion 1: CLAUDE.md exists
        const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
        if (fs.existsSync(claudeMdPath)) {
            logResult('pass', 'CLAUDE.md present at archive root');
        } else {
            logResult('fail', 'CLAUDE.md missing from extracted ZIP');
        }

        // Assertion 2: .claude/mj/VERSION exists
        const versionPath = path.join(tmpDir, '.claude', 'mj', 'VERSION');
        let extractedVersion = null;
        if (fs.existsSync(versionPath)) {
            extractedVersion = fs.readFileSync(versionPath, 'utf-8').trim();
            logResult('pass', `.claude/mj/VERSION present (${extractedVersion})`);
        } else {
            logResult('fail', '.claude/mj/VERSION missing from extracted ZIP');
        }

        // Assertion 3: .claude/settings.json exists
        const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
        if (fs.existsSync(settingsPath)) {
            logResult('pass', '.claude/settings.json present at archive root');
        } else {
            logResult('fail', '.claude/settings.json missing from extracted ZIP');
        }

        // Assertion 4: extracted VERSION matches source PACK_VERSION
        const source = readSourcePackVersion();
        if (extractedVersion !== null) {
            if (extractedVersion === source.packVersion) {
                logResult('pass', `extracted VERSION matches source PACK_VERSION (${source.major}: ${source.packVersion})`);
            } else {
                logResult('fail', `VERSION mismatch — extracted "${extractedVersion}" vs source "${source.packVersion}"`);
            }
        }

        // Assertion 5: MANIFEST.json present + parses + all sha256 match
        const manifestPath = path.join(tmpDir, '.claude', 'mj', 'MANIFEST.json');
        if (!fs.existsSync(manifestPath)) {
            logResult('fail', '.claude/mj/MANIFEST.json missing from extracted ZIP');
        } else {
            let manifest;
            try {
                manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            } catch (err) {
                logResult('fail', `.claude/mj/MANIFEST.json is not valid JSON: ${err.message}`);
                manifest = null;
            }

            if (manifest) {
                if (!Array.isArray(manifest.files) || typeof manifest.packVersion !== 'string') {
                    logResult('fail', 'MANIFEST.json is missing required fields (packVersion, files)');
                } else {
                    let drifted = 0;
                    let missing = 0;
                    let verified = 0;
                    const driftedList = [];
                    const missingList = [];
                    for (const entry of manifest.files) {
                        const filePath = path.join(tmpDir, entry.path);
                        if (!fs.existsSync(filePath)) {
                            missing++;
                            missingList.push(entry.path);
                            continue;
                        }
                        const actual = await computeSha256(filePath);
                        if (actual !== entry.sha256) {
                            drifted++;
                            driftedList.push(entry.path);
                        } else {
                            verified++;
                        }
                    }

                    if (drifted === 0 && missing === 0) {
                        logResult('pass', `MANIFEST integrity: all ${verified} file(s) match recorded sha256`);
                    } else {
                        if (missing > 0) logResult('fail', `MANIFEST integrity: ${missing} file(s) missing after extract — ${missingList.slice(0, 5).join(', ')}${missingList.length > 5 ? '…' : ''}`);
                        if (drifted > 0) logResult('fail', `MANIFEST integrity: ${drifted} file(s) drifted from recorded sha256 — ${driftedList.slice(0, 5).join(', ')}${driftedList.length > 5 ? '…' : ''}`);
                    }
                }
            }
        }
    } finally {
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
    }

    if (failures > 0) {
        console.error(`\n${failures} assertion(s) failed.`);
        process.exit(1);
    }
    console.log('\nAll pack-in-zip assertions passed.');
}

main().catch((err) => {
    console.error(`verify-pack-in-zip: unexpected error`);
    console.error(err);
    process.exit(1);
});
