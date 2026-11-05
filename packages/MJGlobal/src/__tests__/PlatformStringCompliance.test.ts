/**
 * Platform-String Compliance (source guard)
 *
 * Flags branches on a platform name string in the SQL query path:
 *   - `=== 'sqlserver'`, `!== 'postgresql'`, `'sqlserver' === x` (either quote style, any operand order)
 *   - `case 'sqlserver':`, `case 'postgresql':`
 *
 * A branch on the platform name hard-codes a fact about one database where the dialect already
 * states it, and leaves every other dialect (including the External Data Source dialects) on
 * whichever branch is the default. Read the fact from the dialect instead: its lexical rules,
 * grammar facts or writer (`@memberjunction/sql-dialect`).
 *
 * ## Scope
 *
 * `SQLParser/src`, `QueryProcessor/src`, the query-path files of `GenericDatabaseProvider/src`
 * ({@link GDP_QUERY_PATH_FILES}), `MJCoreEntitiesServer/src/custom/query-extraction` and every
 * `src/` folder under `ExternalDataSources/`. Tests, generated code, `dist/` and `.d.ts` files
 * are skipped, as are pure comment lines.
 *
 * ## Baseline
 *
 * The branches that predate this check are listed one by one in
 * `PlatformStringCompliance.baseline.ts` (file and line text). It is a ratchet: a branch not in
 * the list fails, and a listed branch that no longer exists fails too, so the list must shrink as
 * branches are converted to dialect facts. Burn it down; don't grow it.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PLATFORM_STRING_BASELINE } from './PlatformStringCompliance.baseline';

const PACKAGES_ROOT = path.resolve(__dirname, '..', '..', '..'); // packages/

/** The GenericDatabaseProvider files on the query path (RunQuery, rendering, composition, paging, clause screening). */
const GDP_QUERY_PATH_FILES = [
    'GenericDatabaseProvider/src/GenericDatabaseProvider.ts',
    'GenericDatabaseProvider/src/renderPipeline.ts',
    'GenericDatabaseProvider/src/queryCompositionEngine.ts',
    'GenericDatabaseProvider/src/queryPagingEngine.ts',
    'GenericDatabaseProvider/src/clientClauseScreen.ts',
    'GenericDatabaseProvider/src/countOnlyBatch.ts',
    'GenericDatabaseProvider/src/symbolTable.ts',
];

/** Folders and files scanned, relative to packages/. */
const SCAN_PATHS = [
    'SQLParser/src',
    'QueryProcessor/src',
    ...GDP_QUERY_PATH_FILES,
    'MJCoreEntitiesServer/src/custom/query-extraction',
    'ExternalDataSources',
];

const PLATFORM = `(['"\`])(?:sqlserver|postgresql)\\1`;

/** A comparison or `case` against a platform name literal. */
const PLATFORM_BRANCH_PATTERNS = [
    new RegExp(`[!=]==\\s*${PLATFORM}`),
    new RegExp(`${PLATFORM}\\s*[!=]==`),
    new RegExp(`\\bcase\\s+${PLATFORM}\\s*:`),
];

const EXCLUDE_PATH_PATTERNS = [
    /node_modules/,
    /\/dist\//,
    /\/generated\//,
    /\.test\.ts$/,
    /\.spec\.ts$/,
    /__tests__/,
    /\.d\.ts$/,
];

/** One flagged line: its file relative to packages/ (forward slashes) and its trimmed text. */
export interface PlatformStringSite {
    File: string;
    Text: string;
}

function normalizePath(p: string): string {
    return p.split(path.sep).join('/');
}

function shouldScanFile(filePath: string): boolean {
    if (!filePath.endsWith('.ts')) return false;
    if (EXCLUDE_PATH_PATTERNS.some(p => p.test(normalizePath(filePath)))) return false;
    // Under ExternalDataSources only package source counts.
    const relative = normalizePath(path.relative(PACKAGES_ROOT, filePath));
    return !relative.startsWith('ExternalDataSources/') || relative.includes('/src/');
}

function findTsFiles(target: string): string[] {
    if (!fs.existsSync(target)) return [];
    if (fs.statSync(target).isFile()) return shouldScanFile(target) ? [target] : [];
    const results: string[] = [];
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
        if (['node_modules', 'dist', '.git', 'generated', '__tests__'].includes(entry.name)) continue;
        results.push(...findTsFiles(path.join(target, entry.name)));
    }
    return results;
}

/** The platform-string branches in one file's text. */
export function FindPlatformStringSites(relativeFile: string, text: string): PlatformStringSite[] {
    const sites: PlatformStringSite[] = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
        if (PLATFORM_BRANCH_PATTERNS.some(p => p.test(line))) sites.push({ File: relativeFile, Text: trimmed });
    }
    return sites;
}

function scanAll(): PlatformStringSite[] {
    const sites: PlatformStringSite[] = [];
    for (const scanPath of SCAN_PATHS) {
        for (const file of findTsFiles(path.join(PACKAGES_ROOT, scanPath))) {
            const relative = normalizePath(path.relative(PACKAGES_ROOT, file));
            sites.push(...FindPlatformStringSites(relative, fs.readFileSync(file, 'utf-8')));
        }
    }
    return sites;
}

/** Removes each baseline entry from `sites` once; returns the sites left over and the entries not found. */
function diffAgainstBaseline(sites: PlatformStringSite[]): { Added: PlatformStringSite[]; Stale: PlatformStringSite[] } {
    const remaining = [...sites];
    const stale: PlatformStringSite[] = [];
    for (const entry of PLATFORM_STRING_BASELINE) {
        const index = remaining.findIndex(s => s.File === entry.File && s.Text === entry.Text);
        if (index === -1) stale.push(entry);
        else remaining.splice(index, 1);
    }
    return { Added: remaining, Stale: stale };
}

const format = (sites: PlatformStringSite[]) => sites.map(s => `  ${s.File}: ${s.Text}`).join('\n');

describe('Platform-string compliance', () => {
    it('flags comparisons and cases against a platform name, and nothing else', () => {
        const flagged = (code: string) => FindPlatformStringSites('sample.ts', code).length;
        expect(flagged(`if (platform === 'postgresql') {`)).toBe(1);
        expect(flagged(`const pg = "sqlserver" !== key;`)).toBe(1);
        expect(flagged(`    case 'sqlserver':`)).toBe(1);
        expect(flagged('if (x === `postgresql`) {}')).toBe(1);
        expect(flagged(`// if (platform === 'postgresql')`)).toBe(0);
        expect(flagged(`const key: DialectKey = 'postgresql';`)).toBe(0);
        expect(flagged(`if (dialect.Grammar.RecursiveKeyword === 'RECURSIVE') {}`)).toBe(0);
    });

    it('adds no platform-string branch beyond the recorded baseline, and the baseline is current', () => {
        const { Added, Stale } = diffAgainstBaseline(scanAll());
        if (Added.length === 0 && Stale.length === 0) return;
        expect.fail(
            (Added.length > 0
                ? `New platform-string branch(es) in the SQL query path:\n${format(Added)}\n\n` +
                  `Read the fact from the dialect instead of branching on its name: its Lexical, Grammar or\n` +
                  `Writer facet (@memberjunction/sql-dialect), or a SQLDialect member.\n\n`
                : '') +
            (Stale.length > 0
                ? `Baseline entries no longer found (converted or edited — remove them from PlatformStringCompliance.baseline.ts):\n${format(Stale)}\n`
                : '')
        );
    });
});
