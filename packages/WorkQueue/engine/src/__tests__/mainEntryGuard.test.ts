import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])([^'"]+)\1/g;

function resolveRelative(fromFile: string, specifier: string): string | null {
    const base = resolve(dirname(fromFile), specifier);
    return [`${base}.ts`, join(base, 'index.ts')].find((candidate) => existsSync(candidate)) ?? null;
}

/** Every source file reachable from `entry` through relative imports, and every bare specifier they import. */
function walk(entry: string): { Files: Set<string>; Packages: Set<string> } {
    const files = new Set<string>();
    const packages = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
        const file = queue.pop();
        if (file === undefined || files.has(file)) continue;
        files.add(file);
        for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
            const specifier = match[2];
            if (!specifier.startsWith('.')) {
                packages.add(specifier);
                continue;
            }
            const target = resolveRelative(file, specifier);
            if (target) queue.push(target);
        }
    }
    return { Files: files, Packages: packages };
}

describe('engine main entry (03 §0, F12)', () => {
    const main = walk(join(SRC, 'index.ts'));

    it('never reaches work-queue-aws, an AWS SDK package, or src/aws', () => {
        const forbidden = [...main.Packages].filter((name) => name.startsWith('@memberjunction/work-queue-aws') || name.startsWith('@aws-sdk/'));
        expect(forbidden).toEqual([]);
        expect([...main.Files].filter((file) => file.startsWith(join(SRC, 'aws')))).toEqual([]);
    });

    it('never depends on the legacy queue or a data provider (03 §0 layering)', () => {
        const forbidden = [...main.Packages].filter((name) =>
            ['@memberjunction/queue', '@memberjunction/generic-database-provider', '@memberjunction/sqlserver-dataprovider', '@memberjunction/postgresql-dataprovider'].includes(name));
        expect(forbidden).toEqual([]);
    });

    it('the ./aws entry imports engine modules directly, never the main entry or WorkQueueEngine', () => {
        const awsEntry = walk(join(SRC, 'aws', 'index.ts'));
        expect(awsEntry.Files.has(join(SRC, 'index.ts'))).toBe(false);
        expect(awsEntry.Files.has(join(SRC, 'WorkQueueEngine.ts'))).toBe(false);
        expect(awsEntry.Packages.has('@memberjunction/work-queue-aws')).toBe(true);
    });
});
