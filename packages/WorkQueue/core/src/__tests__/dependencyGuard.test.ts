import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const INTERNAL_SCOPE = '@memberjunction/';
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
/** `from '…'`, side-effect `import '…'`, dynamic `import('…')` and `require('…')`, in either quote style. */
const INTERNAL_IMPORT_PATTERNS = [
    /from\s+['"`]@memberjunction\//,
    /import\s+['"`]@memberjunction\//,
    /import\s*\(\s*['"`]@memberjunction\//,
    /require\s*\(\s*['"`]@memberjunction\//,
];

/** The guard's own pattern literals mention the scope; every other file must not. */
const SELF = 'dependencyGuard.test.ts';

function readManifest(): object {
    const parsed: unknown = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('package.json is not a JSON object');
    }
    return parsed;
}

function dependencyNames(manifest: object, field: string): string[] {
    const value: unknown = Reflect.get(manifest, field);
    if (typeof value !== 'object' || value === null) {
        return [];
    }
    return Object.keys(value);
}

function listSourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            return listSourceFiles(full);
        }
        return full.endsWith('.ts') ? [full] : [];
    });
}

describe('work-queue-core dependency guard', () => {
    it('declares no @memberjunction package in any dependency field', () => {
        const manifest = readManifest();
        const internal = DEPENDENCY_FIELDS.flatMap((field) =>
            dependencyNames(manifest, field).filter((name) => name.startsWith(INTERNAL_SCOPE)),
        );
        expect(internal).toEqual([]);
    });

    it('declares no runtime dependencies, so Lambda bundles stay minimal', () => {
        expect(dependencyNames(readManifest(), 'dependencies')).toEqual([]);
    });

    it('imports no @memberjunction module anywhere under src', () => {
        const offenders = listSourceFiles(join(PACKAGE_ROOT, 'src')).filter((file) => {
            if (file.endsWith(SELF)) {
                return false;
            }
            const text = readFileSync(file, 'utf8');
            return INTERNAL_IMPORT_PATTERNS.some((pattern) => pattern.test(text));
        });
        expect(offenders).toEqual([]);
    });

    it('recognises every import form, so nothing slips past the scan', () => {
        const forms = [
            "import { X } from '@memberjunction/core';",
            'import { X } from "@memberjunction/core";',
            "import '@memberjunction/core';",
            "const x = await import('@memberjunction/core');",
            "const x = require('@memberjunction/core');",
        ];
        for (const form of forms) {
            expect(INTERNAL_IMPORT_PATTERNS.some((pattern) => pattern.test(form))).toBe(true);
        }
        expect(INTERNAL_IMPORT_PATTERNS.some((pattern) => pattern.test("import { X } from './local';"))).toBe(false);
    });
});
