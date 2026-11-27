/**
 * @fileoverview The file-line-limit standard.
 *
 * Enforces a maximum line count for non-test TypeScript source files under configured roots
 * (default: 1,000 lines under `packages/AI/Agents/src`), preventing monolithic God-classes from
 * growing back after decomposition.
 *
 * Pre-existing oversized files may be grandfathered via `Options.Allowlist` (burned down over
 * time), and legitimately large files (e.g. generated tables or union definitions) may opt out
 * with a top-of-file rationale comment matching `// file-size-ok: <reason>`.
 *
 * @module @memberjunction/standards
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import type { CheckContext, CheckResult, StandardCheck, Violation } from '../types.js';

const DEFAULT_MAX_LINES = 1000;
const DEFAULT_HEADER_SCAN_LINES = 15;
const DEFAULT_HEADER_REASON_PATTERN = '//\\s*file-size-ok:\\s*\\S+';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const SKIP_DIRS = new Set([
    'node_modules',
    'dist',
    'build',
    'coverage',
    '__tests__',
    '__mocks__',
    'generated',
    'bundled-libs',
    'vendor',
    '.angular',
    '.turbo',
    '.git',
    'unit-testing',
]);
const SKIP_FILE_RE = /\.(?:test|spec|dom\.test|d)\.(?:ts|tsx|mts|cts)$|^(?:vitest|vite)\.config\./;

interface ParsedFileLineLimitOptions {
    MaxLines: number;
    HeaderScanLines: number;
    HeaderReasonRegex: RegExp | null;
    Allowlist: Set<string>;
}

function parseOptions(raw: Readonly<Record<string, unknown>>): ParsedFileLineLimitOptions {
    const rawMax = raw['MaxLines'];
    const maxLines =
        typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax > 0
            ? Math.floor(rawMax)
            : DEFAULT_MAX_LINES;

    const rawScan = raw['HeaderScanLines'];
    const headerScanLines =
        typeof rawScan === 'number' && Number.isFinite(rawScan) && rawScan > 0
            ? Math.floor(rawScan)
            : DEFAULT_HEADER_SCAN_LINES;

    const rawPattern = raw['HeaderReasonPattern'];
    let headerReasonRegex: RegExp | null = new RegExp(DEFAULT_HEADER_REASON_PATTERN);
    if (typeof rawPattern === 'string') {
        headerReasonRegex = rawPattern.trim().length > 0 ? new RegExp(rawPattern) : null;
    }

    const rawAllowlist = raw['Allowlist'];
    const allowlist = new Set<string>();
    if (Array.isArray(rawAllowlist)) {
        for (const item of rawAllowlist) {
            if (typeof item === 'string' && item.trim().length > 0) {
                allowlist.add(item.trim().split('\\').join('/'));
            }
        }
    }

    return {
        MaxLines: maxLines,
        HeaderScanLines: headerScanLines,
        HeaderReasonRegex: headerReasonRegex,
        Allowlist: allowlist,
    };
}

function walkSourceFiles(dir: string, out: string[] = []): string[] {
    if (!existsSync(dir)) return out;
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            walkSourceFiles(full, out);
        } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name)) && !SKIP_FILE_RE.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

/**
 * Counts logical source lines matching `wc -l` / editor line counts (a trailing newline does not
 * add an extra blank line).
 */
export function CountSourceLines(text: string): { LineCount: number; Lines: string[] } {
    if (text.length === 0) {
        return { LineCount: 0, Lines: [] };
    }
    const rawLines = text.split(/\r?\n/);
    const lines = text.endsWith('\n') ? rawLines.slice(0, -1) : rawLines;
    return { LineCount: lines.length, Lines: lines };
}

function hasHeaderExemption(lines: readonly string[], scanLines: number, regex: RegExp | null): boolean {
    if (!regex) return false;
    const limit = Math.min(lines.length, scanLines);
    for (let i = 0; i < limit; i++) {
        if (regex.test(lines[i] ?? '')) {
            return true;
        }
    }
    return false;
}

async function run(context: CheckContext): Promise<CheckResult> {
    const opts = parseOptions(context.Options);
    const files: string[] = [];
    for (const root of context.Roots) {
        walkSourceFiles(join(context.RepoRoot, root), files);
    }

    const violations: Violation[] = [];
    let scanned = 0;
    let allowlisted = 0;
    let headerExempt = 0;

    for (const file of files) {
        const rel = relative(context.RepoRoot, file).split('\\').join('/');
        if (opts.Allowlist.has(rel)) {
            allowlisted++;
            continue;
        }
        scanned++;
        const text = readFileSync(file, 'utf8');
        const { LineCount, Lines } = CountSourceLines(text);
        if (LineCount <= opts.MaxLines) {
            continue;
        }
        if (hasHeaderExemption(Lines, opts.HeaderScanLines, opts.HeaderReasonRegex)) {
            headerExempt++;
            continue;
        }
        violations.push({
            File: rel,
            Line: LineCount,
            Message:
                `File has ${LineCount} lines, exceeding the ${opts.MaxLines}-line limit. ` +
                `Decompose into smaller cohesive helper modules, or — if genuinely justified — add a ` +
                `top-of-file \`// file-size-ok: <reason>\` comment within the first ${opts.HeaderScanLines} lines.`,
        });
    }

    return {
        Violations: violations,
        Notes: [
            `${scanned} source file(s) checked against ${opts.MaxLines}-line limit ` +
                `(${allowlisted} allowlisted, ${headerExempt} header-exempt).`,
        ],
    };
}

/** The registered file-line-limit standard. */
export const FileLineLimitCheck: StandardCheck = {
    Id: 'file-line-limit',
    Title: 'Source files stay at or below the configured line-count ceiling',
    Since: '6.3.0',
    DefaultSeverity: 'error',
    DocsUrl: 'https://github.com/MemberJunction/MJ/blob/next/plans/baseagent-refactor-study.md',
    Description:
        'Enforces a maximum line count (default 1,000 lines) for non-test TypeScript source files ' +
        'under configured roots. Pre-existing oversized files may be grandfathered in Options.Allowlist ' +
        'and legitimately large files may opt out with a top-of-file `// file-size-ok: <reason>` pragma.',
    DefaultRoots: ['packages/AI/Agents/src'],
    DefaultOptions: {
        MaxLines: DEFAULT_MAX_LINES,
        HeaderReasonPattern: DEFAULT_HEADER_REASON_PATTERN,
        Allowlist: [],
    },
    Run: run,
};
