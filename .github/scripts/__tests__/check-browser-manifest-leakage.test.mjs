import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
    packageNameOf,
    extractSpecifiers,
    scanSource,
    scanManifest,
    scanSplitGuards,
    scanSplitManifest,
    findTsFiles,
    DENY,
    GUARDED,
    GUARDED_MANIFESTS,
    SPLIT_GUARD_DIRS,
    SPLIT_GUARD_MANIFESTS,
    LAZY_EXCLUDED_PACKAGES,
    FORBIDDEN_ROOT_PACKAGES,
} from '../check-browser-manifest-leakage.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-browser-manifest-leakage.mjs');
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// ---------------------------------------------------------------------------
// Specifier normalization — the anti-false-positive machinery
// ---------------------------------------------------------------------------

describe('packageNameOf', () => {
    it('strips subpaths from scoped specifiers', () => {
        expect(packageNameOf('@memberjunction/ng-file-storage/file-storage.module')).toBe('@memberjunction/ng-file-storage');
        expect(packageNameOf('@memberjunction/core')).toBe('@memberjunction/core');
    });

    it('handles unscoped packages and rejects relative/absolute paths', () => {
        expect(packageNameOf('rxjs/operators')).toBe('rxjs');
        expect(packageNameOf('./generated/mj-class-registrations.js')).toBeNull();
        expect(packageNameOf('../thing')).toBeNull();
        expect(packageNameOf('/abs/path')).toBeNull();
        expect(packageNameOf('@memberjunction')).toBeNull(); // scope with no package
    });
});

describe('extractSpecifiers', () => {
    it('finds `from`, dynamic `import()`, and bare side-effect imports', () => {
        const src = [
            `import { A } from '@memberjunction/core';`,
            `import '@memberjunction/side-effect';`,
            `const m = () => import('@memberjunction/ng-dashboards');`,
        ].join('\n');
        expect(extractSpecifiers(src).map((s) => s.spec)).toEqual([
            '@memberjunction/core',
            '@memberjunction/side-effect',
            '@memberjunction/ng-dashboards',
        ]);
    });

    it('reports 1-based line numbers', () => {
        const src = `// header\n\nimport { A } from '@memberjunction/core';\n`;
        expect(extractSpecifiers(src)[0].line).toBe(3);
    });

    it('reads multi-line named imports, where the `from` clause is on its own line', () => {
        const src = `import {\n  A,\n  B,\n} from '@memberjunction/templates';\n`;
        expect(scanSource(src, 'f').map((v) => v.pkg)).toEqual(['@memberjunction/templates']);
    });
});

// ---------------------------------------------------------------------------
// Detection — the incident this gate exists for
// ---------------------------------------------------------------------------

describe('scanSource — detection', () => {
    it('catches the June-2026 incident edge (templates + aiengine)', () => {
        const src = `import '@memberjunction/templates';\nimport { X } from '@memberjunction/aiengine';\n`;
        expect(scanSource(src, 'f').map((v) => v.pkg)).toEqual([
            '@memberjunction/templates',
            '@memberjunction/aiengine',
        ]);
    });

    it('catches provider-bundle members individually, not just the bundle', () => {
        const src = `import { X } from '@memberjunction/ai-openai';\nimport { Y } from '@memberjunction/ai-vectors-pinecone';\n`;
        expect(scanSource(src, 'f')).toHaveLength(2);
    });

    it('denies the server-only vector accelerator while its browser-safe base stays allowed', () => {
        const src = `import { A } from '@memberjunction/ai-vectors-memory-server';\nimport { B } from '@memberjunction/ai-vectors-memory';\n`;
        expect(scanSource(src, 'f').map((v) => v.pkg)).toEqual(['@memberjunction/ai-vectors-memory-server']);
    });
});

// ---------------------------------------------------------------------------
// False positives — every one of these is a real package pair in this repo
// ---------------------------------------------------------------------------

describe('scanSource — false-positive traps', () => {
    const allowed = [
        '@memberjunction/ng-file-storage/file-storage.module', // vs @memberjunction/storage
        '@memberjunction/templates-base-types',                // vs @memberjunction/templates
        '@memberjunction/ai-engine-base',                      // vs @memberjunction/aiengine
        '@memberjunction/ai-vectors-memory',                   // vs @memberjunction/ai-vectors-pinecone
        '@memberjunction/ai-core-plus',
        '@memberjunction/ai-realtime-client',
        '@memberjunction/server-bootstrap',                    // vs @memberjunction/server
        '@memberjunction/core-entities-server',                // vs @memberjunction/server
        '@memberjunction/sqlserver-dataprovider',              // vs @memberjunction/server
        '@memberjunction/graphql-dataprovider',
        '@memberjunction/tag-engine-base',
    ];

    for (const spec of allowed) {
        it(`does not flag ${spec}`, () => {
            expect(scanSource(`import { X } from '${spec}';`, 'f')).toEqual([]);
        });
    }

    it('ignores forbidden names appearing as IDENTIFIERS in an import body', () => {
        const src = `import {\n  MJTemplateEntity,\n  MJFileStorageProviderEntity,\n  MJMCPServerEntity,\n} from '@memberjunction/core-entities';\n`;
        expect(scanSource(src, 'f')).toEqual([]);
    });

    it('ignores forbidden names appearing in comments', () => {
        expect(scanSource(`// never import @memberjunction/templates here\n`, 'f')).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// package.json declaration scanning
// ---------------------------------------------------------------------------

describe('scanManifest', () => {
    it('flags a denylisted runtime dependency or peerDependency', () => {
        const json = {
            dependencies: { '@memberjunction/core': '1.0.0', '@memberjunction/storage': '1.0.0' },
            peerDependencies: { '@memberjunction/templates': '1.0.0' },
        };
        expect(scanManifest(json, 'p').map((v) => v.pkg).sort()).toEqual([
            '@memberjunction/storage',
            '@memberjunction/templates',
        ]);
    });

    it('ignores devDependencies — they do not reach the browser bundle', () => {
        expect(scanManifest({ devDependencies: { '@memberjunction/storage': '1.0.0' } }, 'p')).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Eager bundle splitting guards (Wave 5.5 ongoing split guard)
// ---------------------------------------------------------------------------

describe('scanSplitGuards', () => {
    it('flags root import of @memberjunction/ng-bootstrap', () => {
        const src = `import { MJ_ENVIRONMENT } from '@memberjunction/ng-bootstrap';\n`;
        const hits = scanSplitGuards(src, 'test.ts');
        expect(hits).toHaveLength(1);
        expect(hits[0].pkg).toBe('@memberjunction/ng-bootstrap');
        expect(hits[0].kind).toBe('root-import');
    });

    it('allows subpath import @memberjunction/ng-bootstrap/types', () => {
        const src = `import { MJ_ENVIRONMENT, MJEnvironmentConfig } from '@memberjunction/ng-bootstrap/types';\n`;
        expect(scanSplitGuards(src, 'test.ts')).toEqual([]);
    });

    it('flags imports of lazy-excluded packages (ng-dashboards, ng-explorer-settings)', () => {
        const src = [
            `import { DashboardsModule } from '@memberjunction/ng-dashboards';`,
            `import { CoreDashboardsModule } from '@memberjunction/ng-dashboards/core-dashboards.module';`,
            `import { ExplorerSettingsModule } from '@memberjunction/ng-explorer-settings';`,
        ].join('\n');
        const hits = scanSplitGuards(src, 'test.ts');
        expect(hits).toHaveLength(3);
        expect(hits.map((h) => h.pkg)).toEqual([
            '@memberjunction/ng-dashboards',
            '@memberjunction/ng-dashboards',
            '@memberjunction/ng-explorer-settings',
        ]);
    });

    it('allows browser-safe non-lazy packages', () => {
        const src = [
            `import { Component } from '@angular/core';`,
            `import { Metadata } from '@memberjunction/core';`,
            `import { ThemeService } from '@memberjunction/ng-shared';`,
        ].join('\n');
        expect(scanSplitGuards(src, 'test.ts')).toEqual([]);
    });
});

describe('scanSplitManifest', () => {
    it('flags forbidden lazy-excluded dependencies in package.json', () => {
        const json = {
            dependencies: {
                '@memberjunction/core': '1.0.0',
                '@memberjunction/ng-dashboards': '1.0.0',
            },
            peerDependencies: {
                '@memberjunction/ng-explorer-settings': '1.0.0',
            },
        };
        const hits = scanSplitManifest(json, 'package.json', LAZY_EXCLUDED_PACKAGES);
        expect(hits.map((h) => h.pkg).sort()).toEqual([
            '@memberjunction/ng-dashboards',
            '@memberjunction/ng-explorer-settings',
        ]);
    });

    it('ignores allowed dependencies in package.json', () => {
        const json = {
            dependencies: {
                '@memberjunction/core': '1.0.0',
                '@memberjunction/ng-bootstrap': '1.0.0', // allowed in explorer-app because it uses /types
            },
        };
        const hits = scanSplitManifest(json, 'package.json', LAZY_EXCLUDED_PACKAGES);
        expect(hits).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Live repository state — the gate must be green on this branch, and the
// guarded paths must actually exist (a rename must not silently disable it).
// ---------------------------------------------------------------------------

describe('live repository', () => {
    for (const rel of [...GUARDED, ...GUARDED_MANIFESTS, ...SPLIT_GUARD_DIRS, ...SPLIT_GUARD_MANIFESTS.map((m) => m.file)]) {
        it(`guarded path exists: ${rel}`, () => {
            expect(existsSync(join(REPO_ROOT, rel))).toBe(true);
        });
    }

    it('every denylisted name is a real @memberjunction package name shape', () => {
        for (const pkg of DENY) {
            expect(pkg).toMatch(/^@memberjunction\/[a-z0-9-]+$/);
        }
    });

    it('passes on the committed browser manifests (exit 0)', () => {
        const run = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
        expect(run.stderr).toBe('');
        expect(run.status).toBe(0);
    });

    it('NEGATIVE CONTROL: the ServerBootstrap manifest would fail the same check', () => {
        // Proves the gate has teeth. This file legitimately imports server packages — it is
        // NOT guarded — but running the browser rule over it must produce violations. If this
        // ever returns zero, the extractor has silently stopped matching.
        const server = join(REPO_ROOT, 'packages/ServerBootstrap/src/generated/mj-class-registrations.ts');
        const hits = scanSource(readFileSync(server, 'utf8'), 'ServerBootstrap');
        expect(hits.length).toBeGreaterThan(20);
    });

    it('NEGATIVE CONTROL: the full ng-bootstrap manifest would fail the split check', () => {
        // ng-bootstrap is the full eager manifest; it legitimately imports ng-dashboards and ng-explorer-settings.
        // Running scanSplitGuards on it proves the split guard extractor catches them.
        const fullManifest = join(REPO_ROOT, 'packages/Angular/Bootstrap/src/generated/mj-class-registrations.ts');
        const hits = scanSplitGuards(readFileSync(fullManifest, 'utf8'), 'full-manifest');
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.some((h) => h.pkg === '@memberjunction/ng-dashboards')).toBe(true);
    });

    it('denylist covers every member of the AI provider bundle', () => {
        const bundle = JSON.parse(readFileSync(join(REPO_ROOT, 'packages/AI/Providers/Bundle/package.json'), 'utf8'));
        const members = Object.keys(bundle.dependencies ?? {}).filter((d) => d.startsWith('@memberjunction/'));
        expect(members.length).toBeGreaterThan(0);
        expect(members.filter((m) => !DENY.has(m))).toEqual([]);
    });
});
