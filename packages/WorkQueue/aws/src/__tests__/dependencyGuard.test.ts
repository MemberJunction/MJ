import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALLOWED_DEPENDENCIES = ['@aws-sdk/client-sns', '@aws-sdk/client-sqs', '@memberjunction/work-queue-core'];

interface PackageJson {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
}

function readPackageJson(): PackageJson {
    return JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as PackageJson;
}

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            return entry === '__tests__' || entry === '__localstack__' ? [] : sourceFiles(full);
        }
        return full.endsWith('.ts') ? [full] : [];
    });
}

describe('work-queue-aws dependency guard', () => {
    it('declares only the allowed runtime dependencies', () => {
        const pkg = readPackageJson();
        expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(ALLOWED_DEPENDENCIES);
    });

    it('declares no peer or optional dependencies', () => {
        const pkg = readPackageJson();
        expect(pkg.peerDependencies ?? {}).toEqual({});
        expect(pkg.optionalDependencies ?? {}).toEqual({});
    });

    it('imports no MemberJunction package other than work-queue-core from source', () => {
        const offenders = sourceFiles(join(PACKAGE_ROOT, 'src')).flatMap((file) =>
            ImportedModules(readFileSync(file, 'utf8'))
                .filter((name) => name.startsWith('@memberjunction/') && !name.startsWith('@memberjunction/work-queue-core'))
                .map((name) => `${file}: ${name}`));
        expect(offenders).toEqual([]);
    });

    it('recognises every import form', () => {
        const text = [
            `import { A } from '@memberjunction/core';`,
            `import "@memberjunction/global";`,
            `export * from "@memberjunction/ai";`,
            `const x = require('@memberjunction/queue');`,
            `const y = await import("@memberjunction/server");`,
        ].join('\n');
        expect(ImportedModules(text)).toEqual([
            '@memberjunction/core', '@memberjunction/global', '@memberjunction/ai',
            '@memberjunction/queue', '@memberjunction/server',
        ]);
    });
});

/** Module specifiers from `from '…'`, side-effect `import '…'`, `require('…')` and `import('…')`, either quote style. */
function ImportedModules(text: string): string[] {
    const pattern = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])([^'"]+)\1/g;
    return [...text.matchAll(pattern)].map((match) => match[2]);
}
