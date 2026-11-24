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

describe('engine GCP isolation guard', () => {
    const main = walk(join(SRC, 'index.ts'));

    it('never reaches work-queue-gcp, @google-cloud/pubsub, or src/gcp from engine main entry', () => {
        const forbidden = [...main.Packages].filter(
            (name) => name.startsWith('@memberjunction/work-queue-gcp') || name.startsWith('@google-cloud/'),
        );
        expect(forbidden).toEqual([]);
        expect([...main.Files].filter((file) => file.startsWith(join(SRC, 'gcp')))).toEqual([]);
    });

    it('the ./gcp entry imports engine modules directly, never the main entry or WorkQueueEngine', () => {
        const gcpEntry = walk(join(SRC, 'gcp', 'index.ts'));
        expect(gcpEntry.Files.has(join(SRC, 'index.ts'))).toBe(false);
        expect(gcpEntry.Files.has(join(SRC, 'WorkQueueEngine.ts'))).toBe(false);
        expect(gcpEntry.Packages.has('@memberjunction/work-queue-gcp')).toBe(true);
    });
});
