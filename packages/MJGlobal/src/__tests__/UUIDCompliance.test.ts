/**
 * UUID Compliance Tests
 *
 * These tests scan the MemberJunction source tree for direct UUID comparison
 * patterns (=== / !==) that should use UUIDsEqual() or NormalizeUUID() instead.
 *
 * PostgreSQL returns UUIDs in lowercase while SQL Server returns uppercase.
 * Direct string comparisons break cross-database compatibility.
 *
 * If this test fails, it means new code introduced a direct UUID comparison.
 * Fix by replacing `x.ID === y` with `UUIDsEqual(x.ID, y)`.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/** Directories that should never contain UUID comparison anti-patterns */
const SCAN_ROOT = path.resolve(__dirname, '..', '..', '..'); // packages/

/** Patterns that indicate direct UUID comparison (anti-patterns) */
const ANTI_PATTERNS = [
    /\.ID\s*===\s*(?!['"]|true|false|null|undefined|0\b)/,     // .ID === someVar (not string literals or primitives)
    /===\s*\w+\.ID\b/,                                          // something === x.ID
    /\.ID\s*!==\s*(?!['"]|true|false|null|undefined|0\b)/,     // .ID !== someVar
    /!==\s*\w+\.ID\b/,                                          // something !== x.ID
    /\.includes\(\w+\.ID\b\)/,                                   // array.includes(x.ID) — uses === internally
];

/** Files/directories to exclude from scanning */
const EXCLUDE_PATTERNS = [
    /node_modules/,
    /\/dist\//,
    /\/generated\//,
    /\.test\.ts$/,
    /\.spec\.ts$/,
    /__tests__/,
    /UUIDUtils\.ts$/,           // The utility itself
    /\.js$/,                    // Only scan TypeScript source
    /\.d\.ts$/,                 // Skip declaration files
    /\.map$/,                   // Skip source maps
    /package-lock\.json$/,
];

/** Known exceptions — files where .ID === is comparing non-UUID values (e.g., numeric IDs, string enum values) */
const KNOWN_EXCEPTIONS: Record<string, string[]> = {
    // Add file paths (relative to packages/) and the reason they're excepted
    // Example: 'SomePackage/src/file.ts': ['Uses numeric IDs, not UUIDs'],
};

function shouldScanFile(filePath: string): boolean {
    if (!filePath.endsWith('.ts')) return false;
    return !EXCLUDE_PATTERNS.some(pattern => pattern.test(filePath));
}

function findTsFiles(dir: string): string[] {
    const results: string[] = [];

    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
                continue; // Skip these directories entirely for performance
            }
            results.push(...findTsFiles(fullPath));
        } else if (shouldScanFile(fullPath)) {
            results.push(fullPath);
        }
    }
    return results;
}

interface Violation {
    file: string;
    line: number;
    content: string;
    pattern: string;
}

function scanFileForViolations(filePath: string): Violation[] {
    const violations: Violation[] = [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Check if file is in known exceptions
    const relativePath = path.relative(SCAN_ROOT, filePath);
    if (KNOWN_EXCEPTIONS[relativePath]) {
        return [];
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
            continue;
        }

        // Skip import lines
        if (trimmed.startsWith('import ')) {
            continue;
        }

        for (const pattern of ANTI_PATTERNS) {
            if (pattern.test(line)) {
                // Additional filter: skip comparisons with empty string '', string literals, null, undefined, or type checks
                if (/\.ID\s*[!=]==?\s*''/.test(line) || /[!=]==?\s*''/.test(line)) continue;       // Comparing to empty string
                if (/\.ID\s*[!=]==?\s*['"]/.test(line)) continue;                                   // Comparing to any string literal
                if (/[!=]==?\s*['"]/.test(line) && /\.ID\b/.test(line)) continue;                    // String literal comparison involving .ID
                if (/typeof\s+\w+\.ID\s*===/.test(line)) continue;                                  // typeof check
                if (/\.ID\s*===\s*null\b/.test(line) || /\.ID\s*===\s*undefined\b/.test(line)) continue;  // null/undefined check
                if (/\.ID\s*!==\s*null\b/.test(line) || /\.ID\s*!==\s*undefined\b/.test(line)) continue;  // negated null/undefined check

                violations.push({
                    file: relativePath,
                    line: i + 1,
                    content: trimmed.substring(0, 120),
                    pattern: pattern.source,
                });
                break; // One violation per line is enough
            }
        }
    }
    return violations;
}

describe('UUID Comparison Compliance', () => {
    it('should not have direct UUID comparisons (=== / !==) in source files', () => {
        const tsFiles = findTsFiles(SCAN_ROOT);
        const allViolations: Violation[] = [];

        for (const file of tsFiles) {
            allViolations.push(...scanFileForViolations(file));
        }

        if (allViolations.length > 0) {
            const report = allViolations
                .map(v => `  ${v.file}:${v.line}: ${v.content}`)
                .join('\n');
            expect.fail(
                `Found ${allViolations.length} direct UUID comparison(s) that should use UUIDsEqual():\n${report}\n\n` +
                `Fix by replacing:\n` +
                `  - 'x.ID === y' with 'UUIDsEqual(x.ID, y)'\n` +
                `  - 'x.ID !== y' with '!UUIDsEqual(x.ID, y)'\n` +
                `  - 'arr.includes(x.ID)' with 'arr.some(id => UUIDsEqual(id, x.ID))'\n` +
                `Import UUIDsEqual from '@memberjunction/global'.\n` +
                `If a comparison is NOT a UUID (e.g., numeric ID), add it to KNOWN_EXCEPTIONS in this test file.`
            );
        }
    });
});
