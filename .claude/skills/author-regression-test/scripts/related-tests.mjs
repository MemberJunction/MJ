#!/usr/bin/env node
/**
 * Lists the branch's UI changes and the MJ Explorer regression tests related to them.
 *
 *   node related-tests.mjs [--base origin/next] [--keywords a,b] [--top 10]
 *
 * Run from anywhere inside the checkout. Reads git and the test files only.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { parseArgs } from 'node:util';
import { UiPaths, KeywordsForPaths, ScoreTests, TestSummary, IsRegressionTestFile } from './lib/related.mjs';

const TEST_DIR = 'metadata-optional/regression-test/tests/regression';

function git(root, args) {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function changedPaths(root, base) {
    const mergeBase = git(root, ['merge-base', base, 'HEAD']);
    const tracked = git(root, ['diff', '--name-only', mergeBase]);
    const untracked = git(root, ['ls-files', '--others', '--exclude-standard']);
    return [...new Set(`${tracked}\n${untracked}`.split('\n').filter(Boolean))];
}

function readTests(root) {
    const dir = join(root, TEST_DIR);
    return readdirSync(dir)
        .filter(IsRegressionTestFile)
        .map(name => TestSummary(posix.join(TEST_DIR, name), JSON.parse(readFileSync(join(dir, name), 'utf8'))));
}

function printUiPaths(ui, base, hasKeywords) {
    if (ui.length === 0) {
        console.log(`No UI files changed against ${base}.`);
        if (hasKeywords) return;
        console.log('A regression test covers what a user sees in MJ Explorer. For server-only changes, add');
        console.log('integration coverage instead (guides/INTEGRATION_TESTING_QUICKSTART.md).');
        return;
    }
    const byDir = new Map();
    for (const p of ui) byDir.set(posix.dirname(p), (byDir.get(posix.dirname(p)) ?? 0) + 1);
    console.log(`UI files changed against ${base} (${ui.length}):`);
    for (const [dir, count] of byDir) console.log(`  ${dir}/ (${count} file${count === 1 ? '' : 's'})`);
}

function printRelated(ranked, top) {
    if (ranked.length === 0) {
        console.log('Related tests: none found. Try --keywords with words from the feature or its app.');
        return;
    }
    console.log(`Related tests (top ${Math.min(top, ranked.length)} of ${ranked.length}):`);
    for (const { test, matched } of ranked.slice(0, top)) {
        const tags = test.tags.length ? `; ${test.tags.join(', ')}` : '';
        console.log(`  ${test.name}  [${test.priority || '?'}${tags}]  matched: ${matched.join(', ')}`);
        console.log(`    ${test.path}`);
    }
}

function main() {
    const { values } = parseArgs({
        options: {
            base: { type: 'string', default: 'origin/next' },
            keywords: { type: 'string', default: '' },
            top: { type: 'string', default: '10' },
        },
    });
    const root = git(process.cwd(), ['rev-parse', '--show-toplevel']);
    const ui = UiPaths(changedPaths(root, values.base));
    const extra = values.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    printUiPaths(ui, values.base, extra.length > 0);

    const keywords = [...new Set([...KeywordsForPaths(ui), ...extra])];
    if (keywords.length === 0) return;
    console.log(`\nKeywords: ${keywords.join(', ')}\n`);
    printRelated(ScoreTests(readTests(root), keywords), Number(values.top) || 10);
}

main();
