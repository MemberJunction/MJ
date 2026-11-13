/**
 * Pure helpers for the replay-script harvest: read what changed in the worktree, decide whether
 * the change is a clean harvest, and write the PR body. No file or git access happens here.
 */
import { posix } from 'node:path';

/** The folder a harvest may change, relative to the repo root. */
export const HARVEST_DIR = 'metadata-optional/regression-test/tests';

const SCRIPTS_DIR = `${HARVEST_DIR}/regression/scripts`;
const TRACES_DIR = `${HARVEST_DIR}/regression/traces`;
const FILE_REF_PREFIX = '@file:';
const SCRIPT_FIELDS = ['ReplayScript', 'PendingReplayScript'];
const MAX_MESSAGE_LENGTH = 160;
const STACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const URL_HOST = /https?:\/\/([^\/\s"'?#]+)/g;
const FOOTER = '🤖 Generated with [Claude Code](https://claude.com/claude-code)';

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function recordsOf(value) {
    return Array.isArray(value) ? value : [value];
}

/** JSON text with object keys sorted, so two values compare equal when their content is equal. */
function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (isPlainObject(value)) {
        const keys = Object.keys(value).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function statusOf(code) {
    if (code[0] === 'R' || code[0] === 'C') return 'other';
    if (code === '??' || code.includes('A')) return 'new';
    if (code.includes('D')) return 'deleted';
    if (code.includes('M')) return 'modified';
    return 'other';
}

/**
 * Reads `git status --porcelain=v1 -z` output.
 * @param {string} output
 * @returns {{ status: 'new' | 'modified' | 'deleted' | 'other', path: string }[]}
 */
export function ParsePorcelain(output) {
    const parts = output.split('\0');
    const entries = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.length < 4) continue;
        const code = part.slice(0, 2);
        entries.push({ status: statusOf(code), path: part.slice(3) });
        if (code[0] === 'R' || code[0] === 'C') i++;
    }
    return entries;
}

/**
 * The replay-script files a test record points to, as repo-relative paths.
 * @returns {{ field: 'ReplayScript' | 'PendingReplayScript', file: string }[]}
 */
export function ScriptReferences(record) {
    const configuration = record?.fields?.Configuration;
    if (!isPlainObject(configuration)) return [];
    const refs = [];
    for (const field of SCRIPT_FIELDS) {
        const value = configuration[field];
        if (typeof value === 'string' && value.startsWith(FILE_REF_PREFIX)) {
            refs.push({ field, file: posix.join(HARVEST_DIR, value.slice(FILE_REF_PREFIX.length)) });
        }
    }
    return refs;
}

function allReferences(tests) {
    const refs = [];
    for (const test of tests) {
        for (const record of recordsOf(test.record)) {
            for (const ref of ScriptReferences(record)) refs.push({ ...ref, test, name: record?.fields?.Name });
        }
    }
    return refs;
}

/**
 * Script files that no test record points to.
 * @param {{ path: string, record: object }[]} tests
 * @param {string[]} scriptFiles repo-relative paths
 */
export function FindOrphanScripts(tests, scriptFiles) {
    const referenced = new Set(allReferences(tests).map((r) => r.file));
    return scriptFiles.filter((file) => !referenced.has(file));
}

function comparable(record) {
    const copy = JSON.parse(JSON.stringify(record ?? null));
    if (!isPlainObject(copy)) return copy;
    delete copy.sync;
    const configuration = copy.fields?.Configuration;
    if (isPlainObject(configuration)) {
        for (const field of SCRIPT_FIELDS) delete configuration[field];
    }
    return copy;
}

function diffInto(before, after, prefix, changed) {
    if (isPlainObject(before) && isPlainObject(after)) {
        const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
        for (const key of keys) diffInto(before[key], after[key], prefix ? `${prefix}.${key}` : key, changed);
    } else if (canonical(before) !== canonical(after)) {
        changed.push(prefix || '(record)');
    }
}

/**
 * The fields that differ between two versions of a test file, other than the replay-script
 * references and the `sync` block, which a harvest is allowed to change.
 * @returns {string[]} dotted paths, sorted
 */
export function UnexpectedRecordChanges(before, after) {
    const a = recordsOf(before);
    const b = recordsOf(after);
    if (a.length !== b.length) return ['record count'];
    const changed = [];
    a.forEach((record, i) => diffInto(comparable(record), comparable(b[i]), a.length > 1 ? `[${i}]` : '', changed));
    return changed.sort();
}

/** True for a repo-relative path of a test file in the harvest folder (not a script or trace). */
export function IsTestRecordPath(path) {
    if (!path.startsWith(`${HARVEST_DIR}/`)) return false;
    if (path.startsWith(`${SCRIPTS_DIR}/`) || path.startsWith(`${TRACES_DIR}/`)) return false;
    const name = posix.basename(path);
    return name.startsWith('.') && name.endsWith('.json') && name !== '.mj-sync.json';
}

function isValidJson(text) {
    try {
        JSON.parse(text);
        return true;
    } catch {
        return false;
    }
}

/** The hosts other than the local stack that absolute URLs in a script point to, sorted. */
function foreignHosts(text) {
    const hosts = new Set();
    for (const match of text.matchAll(URL_HOST)) {
        const host = match[1].replace(/^[^@]*@/, '').replace(/:\d+$/, '').toLowerCase();
        if (!STACK_HOSTS.has(host)) hosts.add(host);
    }
    return [...hosts].sort();
}

function checkScriptEntry(entry, ctx) {
    if (entry.status === 'deleted') {
        ctx.result.removedScripts.push({ file: entry.path });
        return;
    }
    if (entry.status === 'other') {
        ctx.result.problems.push(`${entry.path}: unexpected git status (rename or copy)`);
        return;
    }
    const text = ctx.scriptText.get(entry.path);
    if (text === undefined || !isValidJson(text)) ctx.result.problems.push(`${entry.path}: not valid JSON`);
    const hosts = foreignHosts(text ?? '');
    if (hosts.length > 0) {
        ctx.result.problems.push(
            `${entry.path}: holds URLs on another host than localhost (${hosts.join(', ')}); ` +
                'record it again with a build that stores those URLs as paths',
        );
    }
    const owner = ctx.owners.get(entry.path);
    if (owner?.field === 'PendingReplayScript') return;
    const item = { test: owner?.name ?? '(no test)', file: entry.path };
    (entry.status === 'new' ? ctx.result.newScripts : ctx.result.updatedScripts).push(item);
}

function checkTestEntry(entry, ctx) {
    if (entry.status !== 'modified') {
        ctx.result.problems.push(`${entry.path}: a harvest must not add or remove test files`);
        return;
    }
    const test = ctx.testsByPath.get(entry.path);
    if (!test?.head) {
        ctx.result.problems.push(`${entry.path}: could not read the test file and its committed version`);
        return;
    }
    const changes = UnexpectedRecordChanges(test.head.record, test.record);
    for (const change of changes) ctx.result.problems.push(`${entry.path}: ${change} changed`);
    if (changes.length === 0 && canonical(test.head.record) === canonical(test.record) && test.head.text !== test.text) {
        ctx.result.problems.push(`${entry.path}: only the formatting changed`);
    }
}

function checkEntry(entry, ctx) {
    if (!entry.path.startsWith(`${HARVEST_DIR}/`)) {
        ctx.result.problems.push(`${entry.path}: changed outside ${HARVEST_DIR}`);
    } else if (entry.path.startsWith(`${SCRIPTS_DIR}/`)) {
        checkScriptEntry(entry, ctx);
    } else if (IsTestRecordPath(entry.path)) {
        checkTestEntry(entry, ctx);
    } else {
        ctx.result.problems.push(`${entry.path}: not a test file or a replay script`);
    }
}

/**
 * Checks that the worktree changes are a clean harvest and lists the scripts it adds or changes.
 * @param {object} input
 * @param {{ status: string, path: string }[]} input.entries changed paths from {@link ParsePorcelain}
 * @param {{ path: string, record: object, text: string, head: { record: object, text: string } | null }[]} input.tests
 *   every test file in the worktree; `head` is the committed version, or null when there is none
 * @param {{ path: string, text: string }[]} input.scripts every replay-script file in the worktree
 */
export function CheckHarvest({ entries, tests, scripts }) {
    const refs = allReferences(tests);
    const result = { problems: [], newScripts: [], updatedScripts: [], removedScripts: [], pendingScripts: [], scriptedTests: [] };
    const ctx = {
        result,
        testsByPath: new Map(tests.map((t) => [t.path, t])),
        scriptText: new Map(scripts.map((s) => [s.path, s.text])),
        owners: new Map(refs.map((r) => [r.file, r])),
    };
    for (const entry of entries) checkEntry(entry, ctx);
    for (const ref of refs) {
        if (!ctx.scriptText.has(ref.file)) {
            result.problems.push(`${ref.test.path}: Configuration.${ref.field} points to a missing file (${ref.file})`);
        }
        if (ref.field === 'PendingReplayScript') result.pendingScripts.push({ test: ref.name, file: ref.file });
        if (ref.field === 'ReplayScript') result.scriptedTests.push(ref.name);
    }
    return result;
}

function details(title, lines) {
    if (lines.length === 0) return [];
    return [`<details><summary>${title} (${lines.length})</summary>`, '', ...lines, '', '</details>', ''];
}

function nameList(names) {
    return names.map((name) => `- \`${name}\``);
}

function tierSummary(testResults) {
    const counts = new Map();
    for (const t of testResults) {
        const tier = t.tier ?? 'none';
        counts.set(tier, (counts.get(tier) ?? 0) + 1);
    }
    return [...counts].map(([tier, n]) => `${n} ${tier}`).join(', ');
}

function failureLine(test) {
    const message = (test.errorMessage ?? '').replace(/\s+/g, ' ').trim();
    if (!message) return `- \`${test.testName}\``;
    const short = message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…` : message;
    return `- \`${test.testName}\`: ${short}`;
}

function runSection({ base, sha, runName, results }) {
    return [
        '## Summary',
        '',
        `Replay scripts from a regression run of \`${base}\` at \`${sha.slice(0, 7)}\` (${runName}).`,
        '',
        '| Result | Tests |',
        '|---|---|',
        `| Passed | ${results.passedTests} |`,
        `| Failed | ${results.failedTests} |`,
        `| Skipped | ${results.skippedTests} |`,
        `| Total | ${results.totalTests} |`,
        '',
        `Run time: ${Math.round(results.durationMs / 60000)} min. Tiers: ${tierSummary(results.testResults)}.`,
        '',
    ];
}

function pendingSection(pendingScripts, driftMarkdown) {
    if (pendingScripts.length === 0) return [];
    return [
        `### Still pending (${pendingScripts.length})`,
        '',
        'These re-recorded scripts are committed as `.pending.json` files and replay does not use them yet.',
        'Review them with `mj test scripts` after the next run.',
        '',
        ...nameList(pendingScripts.map((p) => p.test)),
        '',
        ...(driftMarkdown ? [driftMarkdown.trim(), ''] : []),
    ];
}

function resultsSections(results, scriptedTests) {
    const scripted = new Set(scriptedTests);
    const unscripted = results.testResults.filter((t) => t.status === 'Passed' && !scripted.has(t.testName));
    const failed = results.testResults.filter((t) => t.status !== 'Passed' && t.status !== 'Skipped');
    const lines = details('Passed with no script', nameList(unscripted.map((t) => t.testName)));
    if (failed.length > 0) lines.push(`### Failed tests (${failed.length})`, '', 'A failed test records no script.', '', ...failed.map(failureLine), '');
    return lines;
}

/**
 * The PR body for a harvest.
 * @param {object} input
 * @param {string} input.base the branch the run tested and the PR targets
 * @param {string} input.sha the commit the run tested
 * @param {string} input.runName the run folder name
 * @param {object} input.results the run's results.json
 * @param {object} input.harvest the {@link CheckHarvest} result
 * @param {string} [input.driftMarkdown] `mj test scripts --format=md` output for the pending scripts
 * @param {string[]} [input.promoted] tests whose pending script was promoted
 * @param {string[]} [input.discarded] tests whose pending script was discarded
 */
export function BuildPrBody({ base, sha, runName, results, harvest, driftMarkdown, promoted = [], discarded = [] }) {
    const lines = [
        ...runSection({ base, sha, runName, results }),
        ...details('New scripts', nameList(harvest.newScripts.map((s) => s.test))),
        ...details('Updated scripts', nameList(harvest.updatedScripts.map((s) => s.test))),
        ...details('Promoted re-recordings', nameList(promoted)),
        ...details('Discarded re-recordings', nameList(discarded)),
        ...details('Removed script files', harvest.removedScripts.map((s) => `- \`${s.file}\``)),
        ...pendingSection(harvest.pendingScripts, driftMarkdown),
        ...resultsSections(results, harvest.scriptedTests),
        '## Test plan',
        '',
        '- [ ] `node .github/scripts/check-regression-suite.mjs` passes',
        `- [ ] The next regression run of \`${base}\` uses the replay tier for the tests with new or updated scripts`,
        '',
        FOOTER,
        '',
    ];
    return lines.join('\n');
}
