/**
 * Multi-Provider Compliance Tests (Strict)
 *
 * Scans the MemberJunction source tree for `new Metadata()` and `Metadata.Provider`
 * references — patterns that resolve to the **process-global** default
 * `IMetadataProvider`. These are bugs in any code path that should be per-provider:
 *   - Multi-provider clients (parallel server connections)
 *   - Server-side request handlers (transaction isolation)
 *   - Any class that already owns a provider via `this.ProviderToUse` / `this`
 *
 * See [/CLAUDE.md] section "Don't Reach for the Global Metadata Provider in
 * Per-Provider Code Paths" for the rule and migration patterns.
 *
 * ## Strict mode
 *
 * The migration completed in `multi-provider-threading` (Phase 6 acceptance
 * criterion). The previous ratchet baseline has been deleted. The test now
 * fails on **any** non-allowlisted violation — no per-package allowance.
 *
 * Lines are exempt from the violation count if any of the following hold:
 *   1. They are pure comments / JSDoc (start with `//`, `*`, or `/*`).
 *   2. They are imports.
 *   3. They use the recommended fallback pattern: `provider ?? new Metadata()`
 *      or `provider ?? Metadata.Provider`. The `??` operator clearly marks
 *      "use the supplied provider, or fall back to global", which is the
 *      legitimate terminal state for a helper that accepts an optional
 *      provider parameter.
 *   4. They have an inline allowlist comment: `// global-provider-ok: <reason>`
 *      anywhere on the line. Use sparingly and document the reason — these
 *      are reviewed in PRs.
 *
 * ## How to fix a violation
 *
 * - **Inside a class with a bound provider** (ProviderBase, BaseEngine,
 *   BaseEntity, BaseAngularComponent subclass): use `this.ProviderToUse`
 *   (or `this` when the class IS the provider).
 * - **Inside a helper function**: accept an optional `provider?: IMetadataProvider`
 *   parameter and use the `??` fallback pattern (exempt from the scanner).
 * - **Inside genuinely global / bootstrap / CLI / codegen code**: append
 *   `// global-provider-ok: <specific reason>` on the same line.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SCAN_ROOT = path.resolve(__dirname, '..', '..', '..'); // packages/

/** Anti-pattern regexes — match a global-provider reference. */
const PATTERNS = [
    /\bnew\s+Metadata\s*\(\s*\)/,
    /\bMetadata\.Provider\b/,
];

/**
 * Patterns that indicate a LEGITIMATE global fallback inside an otherwise provider-aware
 * helper. These are the recommended terminal state: a method that accepts
 * `provider?: IMetadataProvider` and falls back to the global default when the
 * caller doesn't supply one. The `??` operator clearly marks "use the supplied
 * provider, or fall back to global." Counting these as violations would penalize
 * the right pattern.
 */
const FALLBACK_PATTERNS = [
    /\?\?\s*\(?\s*new\s+Metadata\s*\(\s*\)/,
    /\?\?\s*Metadata\.Provider\b/,
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
    file: string;
    line: number;
    content: string;
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
        // Skip the legitimate `provider ?? new Metadata()` / `?? Metadata.Provider` fallback
        // pattern — that's the recommended terminal state for provider-aware helpers.
        if (FALLBACK_PATTERNS.some(p => p.test(line))) continue;

        for (const pattern of PATTERNS) {
            if (pattern.test(line)) {
                violations.push({
                    file: relativePath,
                    line: i + 1,
                    content: trimmed.substring(0, 160),
                });
                break;
            }
        }
    }
    return violations;
}

describe('Multi-Provider Compliance', () => {
    it('should not have any non-allowlisted `new Metadata()` or `Metadata.Provider` references', () => {
        const tsFiles = findTsFiles(SCAN_ROOT);
        const allViolations: Violation[] = [];
        for (const file of tsFiles) {
            allViolations.push(...scanFile(file));
        }

        if (allViolations.length === 0) return;

        const report = allViolations
            .slice(0, 50)
            .map(v => `  ${v.file}:${v.line}: ${v.content}`)
            .join('\n');

        const truncatedNote = allViolations.length > 50
            ? `\n  ... and ${allViolations.length - 50} more`
            : '';

        expect.fail(
            `Found ${allViolations.length} non-allowlisted global-provider reference(s):\n` +
            `${report}${truncatedNote}\n\n` +
            `In multi-provider scenarios (parallel client connections, transaction-isolated\n` +
            `server requests), these silently use the wrong provider.\n\n` +
            `How to fix:\n` +
            `  1. Inside a class with a bound provider: use \`this.ProviderToUse\`.\n` +
            `  2. Inside a helper function: accept \`provider?: IMetadataProvider\` and use\n` +
            `     the recommended fallback: \`const md = provider ?? new Metadata();\` (the \`??\`\n` +
            `     form is recognized as a legitimate fallback by this scanner).\n` +
            `  3. Genuinely global / bootstrap / CLI / codegen code: append\n` +
            `     \`// global-provider-ok: <specific reason>\` on the same line.\n\n` +
            `See /CLAUDE.md "Don't Reach for the Global Metadata Provider in Per-Provider\n` +
            `Code Paths" for the full rule and patterns.`
        );
    });
});
