#!/usr/bin/env node
/**
 * Decides whether a failed metadata push in the PostgreSQL integration lane is a PARITY GAP or a
 * possible REGRESSION.
 *
 * A feature PR ships T-SQL migrations only; their PostgreSQL twins arrive later, in the build
 * engineer's /pg-migrate PR. Until then the PostgreSQL database built from migrations-pg lacks the
 * new tables, so `mj sync push` refuses the metadata directories that reference them. That is a
 * parity gap: it is the state of `next`, not something the PR broke, and it must not block every
 * PR. Anything else that fails a push (the PostgreSQL provider failing to save, a bad lookup into
 * real data, a crash) may be a regression the PR introduced, and it must block.
 *
 * A failure is a parity gap only when every error in the push's JSON result names an entity that
 * is missing from the database:
 *   - `Entity "<name>" not found in metadata`, the validator's message for a directory whose entity
 *     has no table yet; or
 *   - `Lookup failed: No record found in 'MJ: Entities' where Name='<name>'`, a reference to such an
 *     entity from another directory.
 * Any other error, or a log with no JSON result to read, is treated as a regression: when in doubt,
 * block.
 *
 * Modes (integration.yml's `pg` output):
 *   - `regressions`: a parity gap is reported as a warning and the lane's tests are skipped
 *     (exit 0, `gap=true` on $GITHUB_OUTPUT); anything else fails (exit 1).
 *   - `gate`: the build engineer's PR, a dispatch, or a release; any failure fails (exit 1), a
 *     parity gap included, since closing the gap is that run's job.
 *
 * Usage: node .github/scripts/classify-pg-parity-gap.mjs --mode=<regressions|gate> <push.log>...
 * Each log is the full output of one failed `mj sync push --ci`.
 */
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The summary error every failed validation adds; it says nothing about the cause. */
const SUMMARY_MESSAGE = /^Validation failed\. Cannot proceed with push\.?$/;

/** Messages that name an entity missing from the database, each capturing the entity's name. */
const MISSING_ENTITY_PATTERNS = [
    /Entity "([^"]+)" not found in metadata/,
    /Lookup failed: No record found in 'MJ: Entities' where Name='([^']+)'/,
];

/**
 * The error messages of the last `sync:push` JSON result in a log, or `null` when the log holds
 * no such result (the push crashed, or its output format changed).
 */
export function readPushErrors(logText) {
    const lines = logText.split('\n').reverse();
    for (const line of lines) {
        const start = line.indexOf('{"version"');
        if (start < 0) continue;
        let result;
        try {
            result = JSON.parse(line.slice(start));
        } catch {
            continue;
        }
        if (result?.command !== 'sync:push') continue;
        const errors = Array.isArray(result.errors) ? result.errors : [];
        return errors.map((e) => String(e?.message ?? '')).filter((m) => m.length > 0);
    }
    return null;
}

/** The missing entity a message names, or `null` when it is some other error. */
export function missingEntityIn(message) {
    for (const pattern of MISSING_ENTITY_PATTERNS) {
        const match = pattern.exec(message);
        if (match) return match[1];
    }
    return null;
}

/**
 * Classifies the failed pushes. `gap` is true only when every log has a JSON result and every
 * non-summary error in it names a missing entity.
 * @returns {{ gap: boolean, entities: string[], others: string[], unreadable: number }}
 */
export function classifyPushFailures(logTexts) {
    const entities = new Set();
    const others = [];
    let unreadable = 0;
    for (const text of logTexts) {
        const messages = readPushErrors(text);
        if (messages === null) {
            unreadable++;
            continue;
        }
        const causes = messages.filter((m) => !SUMMARY_MESSAGE.test(m));
        if (causes.length === 0) {
            others.push('the push failed without naming a cause');
            continue;
        }
        for (const message of causes) {
            const entity = missingEntityIn(message);
            if (entity) entities.add(entity);
            else others.push(message);
        }
    }
    const gap = logTexts.length > 0 && unreadable === 0 && others.length === 0 && entities.size > 0;
    return { gap, entities: [...entities].sort(), others, unreadable };
}

/** The verdict for a mode: whether the job may continue, and what to tell the reader. */
export function verdict(classification, mode) {
    const { gap, entities, others, unreadable } = classification;
    const named = entities.length > 0 ? `missing on PostgreSQL: ${entities.join(', ')}` : '';
    if (!gap) {
        const reasons = [];
        if (unreadable > 0) reasons.push(`${unreadable} push log(s) had no JSON result to classify`);
        if (others.length > 0) reasons.push(`errors other than a missing entity: ${others.join(' | ')}`);
        return { pass: false, message: `The metadata push failed for a reason other than a parity gap, which may be a PostgreSQL regression (${reasons.join('; ')}).` };
    }
    if (mode === 'gate') {
        return { pass: false, message: `Parity gap (${named}). This run gates the build, so the PostgreSQL twins of those migrations must land first (/pg-migrate).` };
    }
    return { pass: true, message: `Parity gap, not a regression: ${named}. Their PostgreSQL migrations arrive with the next /pg-migrate build, so this lane cannot run the suite yet and does not block.` };
}

function main(argv) {
    const mode = argv.find((a) => a.startsWith('--mode='))?.slice('--mode='.length);
    const files = argv.filter((a) => !a.startsWith('--'));
    if (mode !== 'regressions' && mode !== 'gate') {
        console.error(`classify-pg-parity-gap: --mode must be "regressions" or "gate" (got "${mode ?? ''}").`);
        return 2;
    }
    if (files.length === 0) {
        console.error('classify-pg-parity-gap: pass at least one push log.');
        return 2;
    }
    const texts = files.map((f) => (existsSync(f) ? readFileSync(f, 'utf8') : ''));
    const result = verdict(classifyPushFailures(texts), mode);
    if (result.pass) {
        console.log(`::warning title=PostgreSQL parity gap::${result.message}`);
        if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'gap=true\n');
    } else {
        console.log(`::error title=PostgreSQL metadata push failed::${result.message}`);
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## PostgreSQL metadata push\n\n${result.message}\n`);
    }
    return result.pass ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(main(process.argv.slice(2)));
}
