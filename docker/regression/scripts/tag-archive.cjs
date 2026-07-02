/**
 * Tag a freshly-pulled TestSuiteRun archive directory.
 *
 * The archive flow pulls `MJ: Test Suite Runs` + children into
 * `${RUN_DIR}/archive/test-suite-runs/.<id>.json` before pushing to the
 * archive database. This script appends a tag (typically the source
 * environment name — "staging-nightly", "customer-X", etc.) to the
 * record's `Tags` field so downstream `mj test compare --tag=<name>`
 * filtering can distinguish runs from different sources.
 *
 * Inputs (env vars):
 *   - RUN_DIR (required)   — the test-results/run-* directory
 *   - ARCHIVE_TAG (optional) — comma-separated tag value(s) to append to `Tags`.
 *                              Falls back to the value of TEST_SUITE_NAME if unset.
 *   - ARCHIVE_SOURCE (optional) — additional human-readable source marker;
 *                                 written to the `MachineName` field IFF the
 *                                 existing value is the docker container's
 *                                 hostname (a 12-char hex), which is otherwise
 *                                 useless. Skipped if MachineName looks
 *                                 user-set.
 *
 * No-op when:
 *   - RUN_DIR/archive/test-suite-runs/ doesn't exist (archive wasn't pulled)
 *   - No record JSON files found
 *   - ARCHIVE_TAG is unset and TEST_SUITE_NAME is unset
 *
 * Never throws — failures are logged and the script exits 0 so the
 * surrounding entrypoint continues to the push step.
 */

const fs = require('node:fs');
const path = require('node:path');

const RUN_DIR = process.env.RUN_DIR;
const ARCHIVE_TAG = (process.env.ARCHIVE_TAG ?? process.env.TEST_SUITE_NAME ?? '').trim();
const ARCHIVE_SOURCE = (process.env.ARCHIVE_SOURCE ?? '').trim();

function log(msg) {
    console.log(`[tag-archive] ${msg}`);
}

if (!RUN_DIR) {
    log('RUN_DIR not set — nothing to do');
    process.exit(0);
}

const targetDir = path.join(RUN_DIR, 'archive', 'test-suite-runs');
if (!fs.existsSync(targetDir)) {
    log(`No archive at ${targetDir} — skipping tag step`);
    process.exit(0);
}

if (!ARCHIVE_TAG && !ARCHIVE_SOURCE) {
    log('Neither ARCHIVE_TAG nor ARCHIVE_SOURCE set — nothing to apply');
    process.exit(0);
}

// Find every TestSuiteRun JSON record file (dot-prefixed JSON, excluding the
// .mj-sync.json config). mj-sync writes them as `.<lowercase-id-prefix>.json`.
const candidates = fs.readdirSync(targetDir)
    .filter(name => name.startsWith('.') && name.endsWith('.json') && name !== '.mj-sync.json');

if (candidates.length === 0) {
    log(`No record JSONs in ${targetDir} — skipping`);
    process.exit(0);
}

const DOCKER_HOSTNAME = /^[0-9a-f]{12}$/i; // 12-char hex = container ID, useless as MachineName

let updated = 0;
for (const filename of candidates) {
    const filePath = path.join(targetDir, filename);
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const doc = JSON.parse(raw);
        const fields = doc?.fields;
        if (!fields || typeof fields !== 'object') continue;

        let changed = false;

        // Append ARCHIVE_TAG to Tags. Stored as a JSON array STRING so the
        // downstream `mj test compare --tag=<name>` filter can LIKE-match the
        // quoted form ['%"<name>"%'] without false positives from substrings
        // (e.g. tag "prod" matching "production"). See compare.ts § 144-152.
        if (ARCHIVE_TAG) {
            // Tags is always stored as a JSON-array string (this script is the
            // only writer). Parse it back; treat anything else as empty.
            let existing = [];
            if (Array.isArray(fields.Tags)) {
                existing = fields.Tags.filter((t) => typeof t === 'string');
            } else if (typeof fields.Tags === 'string' && fields.Tags.trim().startsWith('[')) {
                try {
                    const parsed = JSON.parse(fields.Tags);
                    if (Array.isArray(parsed)) existing = parsed.filter((t) => typeof t === 'string');
                } catch { /* malformed — start fresh */ }
            }
            if (!existing.includes(ARCHIVE_TAG)) existing.push(ARCHIVE_TAG);
            const next = JSON.stringify(existing);
            if (fields.Tags !== next) {
                fields.Tags = next;
                changed = true;
            }
        }

        // Replace docker-container MachineName with ARCHIVE_SOURCE when applicable
        if (ARCHIVE_SOURCE) {
            const machineName = typeof fields.MachineName === 'string' ? fields.MachineName.trim() : '';
            if (!machineName || DOCKER_HOSTNAME.test(machineName)) {
                fields.MachineName = ARCHIVE_SOURCE;
                changed = true;
            }
        }

        if (changed) {
            fs.writeFileSync(filePath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
            updated++;
            log(`Tagged ${filename}`);
        }
    } catch (err) {
        log(`Failed to tag ${filename}: ${err.message ?? err}`);
    }
}

log(`Done. Updated ${updated}/${candidates.length} record file(s).`);
