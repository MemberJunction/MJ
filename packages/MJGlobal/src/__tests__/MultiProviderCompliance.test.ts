/**
 * Multi-Provider Compliance Tests (Ratchet)
 *
 * Scans the MemberJunction source tree for `new Metadata()` and `Metadata.Provider`
 * references — patterns that resolve to the **process-global** default
 * `IMetadataProvider`. These are bugs in any code path that should be per-provider:
 *   - Multi-provider clients (parallel server connections)
 *   - Server-side request handlers (transaction isolation)
 *   - Any class that already owns a provider via `this.ProviderToUse` / `this`
 *
 * See [/CLAUDE.md] section "Don't Reach for the Global Metadata Provider in
 * Per-Provider Code Paths" and [/plans/multi-provider-threading.md] for the
 * migration plan.
 *
 * ## Ratchet mode (TEMPORARY — flips to strict at end of Phase 6)
 *
 * The migration is multi-phase (~1160 known violations across ~110 packages
 * at Phase 1 baseline). Rather than block the test on the entire migration,
 * we use a **ratchet**:
 *   - `multi-provider-baseline.json` records the per-package violation count
 *     at a known-good moment.
 *   - Test FAILS if any package's count exceeds its baseline.
 *   - Test WARNS (does not fail) if a package's count drops below baseline —
 *     update the baseline to lock in the reduction.
 *
 * **At the end of Phase 6** (per `/plans/multi-provider-threading.md` §10
 * "Acceptance Criteria for 'Done'"), this ratchet must be replaced with a
 * strict check:
 *   - Delete `multi-provider-baseline.json`.
 *   - Replace the per-package comparison logic below with: any non-allowlisted
 *     violation fails the test outright. No per-package allowance.
 * Ratchet mode is a migration-only crutch and must not survive past Phase 6.
 *
 * ## How to suppress a legitimate violation
 *
 * Add `// global-provider-ok: <reason>` on the same line. Examples of reasons:
 *   - "bootstrap: runs before any per-request context exists"
 *   - "CLI: codegen reads schema offline, single-provider"
 *   - "internal Metadata getter/setter implementation"
 *
 * ## How to update the baseline (after legitimately fixing or adding violations)
 *
 * Edit `packages/MJGlobal/src/__tests__/multi-provider-baseline.json`. Set the
 * package's count to the new value. Explain in the PR description why it
 * changed (which phase of the migration, what was fixed/added).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SCAN_ROOT = path.resolve(__dirname, '..', '..', '..'); // packages/
const BASELINE_FILE = path.resolve(__dirname, 'multi-provider-baseline.json');

/** Anti-pattern regexes — match a global-provider reference. */
const PATTERNS = [
    /\bnew\s+Metadata\s*\(\s*\)/,
    /\bMetadata\.Provider\b/,
];

/** Inline allowlist marker — line is intentional global use. */
const ALLOW_COMMENT = /\/\/\s*global-provider-ok\b/i;

/** Path patterns to skip during scan. Mirrors UUIDCompliance.test.ts. */
const EXCLUDE_PATH_PATTERNS = [
    /node_modules/,
    /\/dist\//,
    /\/generated\//,
    /\.test\.ts$/,
    /\.spec\.ts$/,
    /__tests__/,
    /\.d\.ts$/,
    /\.map$/,
    /\.js$/,
];

interface Violation {
    packageKey: string;
    file: string;
    line: number;
    content: string;
}

/**
 * Derive a stable per-package key from a file path under `packages/`.
 *
 * Rule: take the segments under `packages/` up to (but not including) the
 * first `src/` segment. This collapses files within a package to a single
 * key, and respects the nested-package layout (e.g. AI/Agents, Angular/Generic/...).
 *
 * Examples:
 *   packages/MJCore/src/foo.ts             → "MJCore"
 *   packages/AI/Agents/src/foo.ts          → "AI/Agents"
 *   packages/Angular/Generic/data-context/src/lib/foo.ts → "Angular/Generic/data-context"
 */
function getPackageKey(filePath: string): string {
    const rel = path.relative(SCAN_ROOT, filePath);
    const parts = rel.split(path.sep);
    const srcIdx = parts.indexOf('src');
    if (srcIdx <= 0) return parts[0];
    return parts.slice(0, srcIdx).join('/');
}

function shouldScanFile(filePath: string): boolean {
    if (!filePath.endsWith('.ts')) return false;
    return !EXCLUDE_PATH_PATTERNS.some(p => p.test(filePath));
}

function findTsFiles(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // Hard-skip massive / irrelevant directories for performance
            if (
                entry.name === 'node_modules' ||
                entry.name === 'dist' ||
                entry.name === '.git' ||
                entry.name === 'generated' ||
                entry.name === '__tests__'
            ) {
                continue;
            }
            results.push(...findTsFiles(fullPath));
        } else if (shouldScanFile(fullPath)) {
            results.push(fullPath);
        }
    }
    return results;
}

function scanFile(filePath: string): Violation[] {
    const violations: Violation[] = [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const packageKey = getPackageKey(filePath);
    const relativePath = path.relative(SCAN_ROOT, filePath);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip pure comment lines (block / line comments / JSDoc)
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
        // Skip imports — `import { Metadata } from ...` is not a use site
        if (trimmed.startsWith('import ')) continue;
        // Skip lines explicitly allowlisted with the marker comment
        if (ALLOW_COMMENT.test(line)) continue;

        for (const pattern of PATTERNS) {
            if (pattern.test(line)) {
                violations.push({
                    packageKey,
                    file: relativePath,
                    line: i + 1,
                    content: trimmed.substring(0, 160),
                });
                break; // one violation per line
            }
        }
    }
    return violations;
}

function aggregateByPackage(violations: Violation[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const v of violations) {
        counts[v.packageKey] = (counts[v.packageKey] ?? 0) + 1;
    }
    return counts;
}

function sortedRecord(rec: Record<string, number>): Record<string, number> {
    return Object.fromEntries(Object.entries(rec).sort((a, b) => a[0].localeCompare(b[0])));
}

describe('Multi-Provider Compliance', () => {
    it('per-package violation counts must not exceed baseline', () => {
        const tsFiles = findTsFiles(SCAN_ROOT);
        const allViolations: Violation[] = [];
        for (const file of tsFiles) {
            allViolations.push(...scanFile(file));
        }

        const currentCounts = aggregateByPackage(allViolations);

        // First run (no baseline yet) — auto-generate it and pass.
        // Subsequent runs are checked against the persisted baseline.
        if (!fs.existsSync(BASELINE_FILE)) {
            fs.writeFileSync(
                BASELINE_FILE,
                JSON.stringify(sortedRecord(currentCounts), null, 2) + '\n'
            );
            console.log(
                `[multi-provider-compliance] Baseline file generated at ${BASELINE_FILE}.\n` +
                `Re-run the test to verify it passes against the new baseline.`
            );
            return;
        }

        const baseline: Record<string, number> = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));

        const regressions: string[] = [];
        const newPackages: string[] = [];

        for (const pkg of Object.keys(currentCounts).sort()) {
            const current = currentCounts[pkg];
            if (!(pkg in baseline)) {
                if (current > 0) {
                    newPackages.push(`  ${pkg}: ${current} (no baseline entry — must be added or violations removed)`);
                }
            } else if (current > baseline[pkg]) {
                regressions.push(`  ${pkg}: ${current} (baseline ${baseline[pkg]}, +${current - baseline[pkg]})`);
            }
        }

        const reductions: string[] = [];
        for (const pkg of Object.keys(baseline).sort()) {
            const current = currentCounts[pkg] ?? 0;
            const baselineCount = baseline[pkg];
            if (current < baselineCount) {
                reductions.push(`  ${pkg}: ${current} (baseline ${baselineCount}, -${baselineCount - current})`);
            }
        }

        const failures = [...regressions, ...newPackages];
        if (failures.length > 0) {
            const sampleViolations = allViolations
                .filter(v => failures.some(line => line.startsWith(`  ${v.packageKey}:`)))
                .slice(0, 15)
                .map(v => `  ${v.file}:${v.line}: ${v.content}`);

            const msg = [
                `Multi-provider compliance regressions detected — ${failures.length} package(s) added new violations:`,
                ...failures,
                '',
                'Each violation is a `new Metadata()` or `Metadata.Provider` reference in non-test, non-generated source.',
                'In multi-provider scenarios (parallel client connections, transaction-isolated server requests),',
                'these silently use the wrong provider.',
                '',
                'How to fix:',
                '  1. Replace with provider-aware code: use `this.ProviderToUse` if the class owns one,',
                '     accept an optional `provider?: IMetadataProvider` parameter, or use the caller-supplied provider.',
                '     See /plans/multi-provider-threading.md for full patterns.',
                '  2. If the call genuinely should use the global default (bootstrap, CLI, codegen),',
                '     add `// global-provider-ok: <short reason>` on the same line.',
                '  3. If you intentionally added violations as part of a phased migration,',
                '     update packages/MJGlobal/src/__tests__/multi-provider-baseline.json',
                '     and explain in the PR description why.',
                '',
                'Sample offending lines:',
                ...(sampleViolations.length > 0 ? sampleViolations : ['  (none captured)']),
            ].join('\n');

            expect.fail(msg);
        }

        if (reductions.length > 0) {
            // Don't fail — reducing violations is the goal. But surface the diff so
            // the baseline can be ratcheted down in a follow-up commit.
            console.log(
                `[multi-provider-compliance] ${reductions.length} package(s) have FEWER violations than baseline:\n` +
                reductions.join('\n') + '\n' +
                `Lock in the reduction by updating packages/MJGlobal/src/__tests__/multi-provider-baseline.json` +
                ` to match the current counts.`
            );
        }
    });
});
