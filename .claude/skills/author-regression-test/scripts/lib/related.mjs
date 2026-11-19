/**
 * Pure helpers that find the MJ Explorer regression tests related to a branch's UI changes.
 * No file or git access here; the CLI in ../related-tests.mjs does that.
 */
import { posix } from 'node:path';

const TEST_FILE = /(\.test|\.spec|\.dom\.test)\.[cm]?[jt]s$/;
const DOC_FILE = /\.(md|txt)$/i;

/** Folder and file words that say nothing about the UI area. */
const GENERIC_WORDS = new Set([
    'packages', 'angular', 'explorer', 'generic', 'dashboards', 'dashboard', 'src', 'lib', 'app', 'apps',
    'components', 'component', 'services', 'service', 'shared', 'common', 'core', 'base', 'index',
    'module', 'modules', 'ts', 'js', 'html', 'css', 'scss', 'json', 'test', 'tests', 'tab', 'dom', 'ui',
    'public', 'api', 'types', 'type', 'utils', 'util', 'models', 'model', 'directives', 'directive',
    'pipes', 'pipe', 'the', 'and', 'mj', 'memberjunction', 'custom', 'generated', 'metadata',
    'applications', 'application', 'resource', 'resources', 'view', 'views', 'page', 'pages', 'panel',
]);

/** Changed paths, other than tests, docs and CodeGen output, that can change what a user sees in MJ Explorer. */
export function UiPaths(paths) {
    return paths.filter(p => {
        if (TEST_FILE.test(p) || DOC_FILE.test(p) || p.includes('/__tests__/') || p.includes('/generated/')) return false;
        return p.startsWith('packages/Angular/') || p.startsWith('metadata/applications/');
    });
}

/** "ComponentStudio" → "component-studio"; "form_builder" → "form-builder". */
function toKebab(name) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[_\s]+/g, '-')
        .toLowerCase();
}

/** The names a path contributes: every folder, plus the file name without its extensions. */
function namesOf(path) {
    const parts = path.split('/');
    const file = parts.pop() ?? '';
    if (path.startsWith('metadata/applications/')) {
        return [file.replace(/^\./, '').replace(/\.json$/, '').replace(/-applications?$/, '')];
    }
    return [...parts, ...file.replace(/^\./, '').split('.')];
}

function addKeywords(name, into) {
    const kebab = toKebab(name);
    const words = kebab.split('-').filter(Boolean);
    const specific = words.filter(w => w.length >= 3 && !GENERIC_WORDS.has(w));
    if (specific.length === 0) return;
    if (words.length >= 2) into.add(kebab);
    if (specific.length >= 2) into.add(specific.join('-'));
    for (const w of specific) into.add(w);
}

/** Area words and kebab tags for the changed UI paths, in first-seen order. */
export function KeywordsForPaths(paths) {
    const keywords = new Set();
    for (const path of paths) {
        for (const name of namesOf(path)) addKeywords(name, keywords);
    }
    return [...keywords];
}

function parseJsonField(value) {
    if (value && typeof value === 'object') return value;
    try {
        return JSON.parse(value ?? '{}');
    } catch {
        return {};
    }
}

/** The fields of a regression test file that matter for finding related tests. */
export function TestSummary(path, record) {
    const fields = record.fields ?? {};
    const allTags = String(fields.Tags ?? '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    const input = parseJsonField(fields.InputDefinition);
    return {
        path,
        name: fields.Name ?? '',
        priority: (allTags.find(t => /^p[0-3]$/.test(t)) ?? '').toUpperCase(),
        tags: allTags.filter(t => !/^p[0-3]$/.test(t) && t !== 'regression'),
        goal: input.goal ?? '',
        description: fields.Description ?? '',
        startUrl: input.startUrl ?? '',
    };
}

function padded(text) {
    return ` ${String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

function hasWords(text, keyword) {
    return text.includes(padded(keyword));
}

/** Weight of the best place a keyword appears: a tag 3, the name 2, the goal or description 1. */
function keywordWeight(test, keyword, name, body) {
    if (test.tags.includes(keyword)) return 3;
    if (hasWords(name, keyword)) return 2;
    if (hasWords(body, keyword)) return 1;
    return 0;
}

/** Tests with at least one keyword match, best first, with the keywords each one matched. */
export function ScoreTests(tests, keywords) {
    const ranked = [];
    for (const test of tests) {
        const name = padded(test.name);
        const body = padded(`${test.goal} ${test.description}`);
        let score = 0;
        const matched = [];
        for (const keyword of keywords) {
            const weight = keywordWeight(test, keyword, name, body);
            if (weight > 0) {
                score += weight;
                matched.push(keyword);
            }
        }
        if (score > 0) ranked.push({ test, score, matched: matched.sort() });
    }
    return ranked.sort((a, b) => b.score - a.score || a.test.name.localeCompare(b.test.name));
}

/** True for a test file name in the regression folder (`.T###-*.json`). */
export function IsRegressionTestFile(name) {
    return /^\.T\d{3,}-.*\.json$/.test(posix.basename(name));
}
