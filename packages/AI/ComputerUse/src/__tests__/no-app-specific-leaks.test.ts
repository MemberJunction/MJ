import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

/**
 * CU-E7 layering gate. `@memberjunction/computer-use` (Layer 1) MUST stay
 * application-agnostic — no hardcoded selectors, routes, marker text, or
 * behavior for any specific app under test. App-specific signals enter only
 * as opaque runtime config / prompt data supplied by Layer 2.
 *
 * This test fails if any of the known app-specific leak strings reappears in
 * shipped Layer-1 source (including the metadata-generated prompt parts). The
 * `__tests__` directory is excluded — this file necessarily contains the
 * denylist literals themselves.
 *
 * If you're adding a genuinely generic term that happens to collide, narrow
 * the pattern here — don't weaken the gate by deleting an entry.
 */

const __filename = fileURLToPath(import.meta.url);
const SRC_DIR = join(dirname(__filename), '..');

/** Unambiguous app-specific markers that must never appear in Layer 1. */
const DENY: RegExp[] = [
    /MJExplorer/i,
    /Loading workspace/i,
    /Loading configurations/i,
    /Spinning up resources/i,
    /\bmj-loading\b/i,
    /resource-constrained/i,
];

function collectSourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        if (name === '__tests__' || name === 'node_modules') continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            out.push(...collectSourceFiles(full));
        } else if (/\.(ts|md)$/.test(name)) {
            out.push(full);
        }
    }
    return out;
}

describe('Computer Use Layer-1 app-agnostic gate (CU-E7)', () => {
    const files = collectSourceFiles(SRC_DIR);

    it('finds source files to scan', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    it('contains no app-specific marker strings in shipped source', () => {
        const violations: string[] = [];
        for (const file of files) {
            const lines = readFileSync(file, 'utf8').split('\n');
            lines.forEach((line, i) => {
                for (const pattern of DENY) {
                    if (pattern.test(line)) {
                        violations.push(`${relative(SRC_DIR, file)}:${i + 1}  ${pattern}  →  ${line.trim()}`);
                    }
                }
            });
        }
        expect(violations, `App-specific leaks found in Layer-1 source:\n${violations.join('\n')}`).toEqual([]);
    });
});
