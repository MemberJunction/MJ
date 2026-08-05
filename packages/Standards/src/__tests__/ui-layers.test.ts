import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckForbiddenDeps, IsAllowed, ParseImports, ProbeUndeclaredPackages, StripComments, UILayersCheck } from '../checks/ui-layers.js';

describe('StripComments', () => {
    it('blanks line comments while preserving line numbers', () => {
        const source = ['const a = 1;', '// this calls new RunView() on the global provider', 'const b = 2;'].join('\n');
        const stripped = StripComments(source);
        expect(stripped.split('\n')).toHaveLength(3);
        expect(stripped).not.toContain('RunView');
    });

    it('blanks block comments while preserving line numbers', () => {
        const source = ['/**', ' * Loads via new Metadata() today.', ' */', 'export class X {}'].join('\n');
        const stripped = StripComments(source);
        expect(stripped.split('\n')[3]).toBe('export class X {}');
        expect(stripped).not.toContain('Metadata');
    });

    it('leaves real code alone', () => {
        expect(StripComments('const rv = new RunView();')).toBe('const rv = new RunView();');
    });
});

describe('ParseImports', () => {
    it('captures named bindings and the specifier', () => {
        const [r] = ParseImports(`import { Router, ActivatedRoute } from '@angular/router';`);
        expect(r.Specifier).toBe('@angular/router');
        expect(r.Names).toEqual(['Router', 'ActivatedRoute']);
    });

    it('unwraps type-only and aliased bindings to the source name', () => {
        const [r] = ParseImports(`import { type NavigationService as Nav } from '@memberjunction/ng-shared';`);
        expect(r.Names).toEqual(['NavigationService']);
    });

    it('handles multi-line clauses', () => {
        const [r] = ParseImports(`import {\n  BaseResourceComponent,\n  SharedService,\n} from '@memberjunction/ng-shared';`);
        expect(r.Names).toEqual(['BaseResourceComponent', 'SharedService']);
    });

    it('captures re-exports, which bind symbols just as imports do', () => {
        const [r] = ParseImports(`export { Router } from '@angular/router';`);
        expect(r.Names).toEqual(['Router']);
    });

    it('does not treat a namespace import as a named binding', () => {
        const [r] = ParseImports(`import * as path from 'node:path';`);
        expect(r.Names).toEqual([]);
    });
});

describe('IsAllowed — the reviewed-exception marker', () => {
    it('honours a marker on the offending line', () => {
        expect(IsAllowed([`import { Router } from '@angular/router'; // mj-ui-layers-allow: why`], 1)).toBe(true);
    });

    it('honours a marker on the line directly above', () => {
        expect(IsAllowed(['// mj-ui-layers-allow: why', `import { Router } from '@angular/router';`], 2)).toBe(true);
    });

    it('does NOT reach further than one line above', () => {
        // A wider window would let a marker drift away from the thing it excuses.
        expect(IsAllowed(['// mj-ui-layers-allow: why', '', `import { Router } from '@angular/router';`], 3)).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Filesystem-backed behaviour
// ─────────────────────────────────────────────────────────────────────────────

let repo: string;

function writePackage(name: string, manifest: Record<string, unknown>, files: Record<string, string>): string {
    const dir = join(repo, 'packages', name);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `@demo/${name}`, ...manifest }, null, 2));
    for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, 'src', file), content);
    return dir;
}

beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'mj-standards-'));
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

const run = (options: Record<string, unknown> = {}) =>
    UILayersCheck.Run({ RepoRoot: repo, Roots: ['packages'], Options: { ...UILayersCheck.DefaultOptions, ...options } });

describe('CheckForbiddenDeps — the manifest-half exception', () => {
    const REASON = { '@memberjunction/ng-shared': 'blessed import, tracked in MJ#3404' };

    it('flags a forbidden dep with no exception', () => {
        expect(CheckForbiddenDeps(['@memberjunction/ng-shared'], {}, 'widgets')).toEqual([
            expect.stringContaining('must not depend on it'),
        ]);
    });

    it('excuses a forbidden dep that carries a reason', () => {
        expect(CheckForbiddenDeps(['@memberjunction/ng-shared'], REASON, 'widgets')).toEqual([]);
    });

    it('rejects an exception whose reason is blank', () => {
        expect(CheckForbiddenDeps(['@angular/router'], { '@angular/router': '  \t ' }, 'widgets')).toEqual([
            expect.stringContaining('empty "mjUILayerAllow" reason'),
        ]);
    });

    it('flags a stale exception so the allowlist has to shrink on its own', () => {
        // The dep is gone but the entry survives, reading as a live reviewed decision.
        expect(CheckForbiddenDeps([], REASON, 'widgets')).toEqual([expect.stringContaining('stale exception')]);
    });

    it('flags an exception for a dep that was never forbidden here', () => {
        expect(CheckForbiddenDeps(['@memberjunction/core'], { '@memberjunction/core': 'why' }, 'widgets')).toEqual([
            expect.stringContaining('stale exception'),
        ]);
    });

    it('leaves layers with no forbidden deps alone', () => {
        expect(CheckForbiddenDeps(['@memberjunction/ng-shared', '@angular/router'], {}, 'shell')).toEqual([]);
    });
});

describe('UILayersCheck', () => {
    it('skips undeclared packages by default', async () => {
        writePackage('undeclared', {}, { 'a.ts': `import { Router } from '@angular/router';` });
        const result = await run();
        expect(result.Violations).toEqual([]);
    });

    it('flags a widget that imports Router', async () => {
        writePackage('w', { mjUILayer: 'widgets' }, { 'a.ts': `import { Router } from '@angular/router';` });
        const result = await run();
        expect(result.Violations.map((v) => v.Message)).toEqual(
            expect.arrayContaining([expect.stringContaining('@angular/router'), expect.stringContaining('Router')]),
        );
    });

    it('flags a widget that DECLARES router even without importing it', async () => {
        // The manifest half matters: nothing stops the next commit from using a declared dep.
        writePackage('w', { mjUILayer: 'widgets', dependencies: { '@angular/router': '21.1.3' } }, { 'a.ts': 'export const x = 1;' });
        const result = await run();
        expect(result.Violations).toHaveLength(1);
        expect(result.Violations[0].Message).toContain('declares "@angular/router"');
    });

    it('honours a reasoned mjUILayerAllow for a dep the source is already allowed to import', async () => {
        // The case this exists for: an import carrying an mj-ui-layers-allow marker still has to
        // resolve, so the dep MUST be declared for it to build — leaving the package no green state
        // at all until the manifest half can be excused too.
        writePackage(
            'w',
            {
                mjUILayer: 'widgets',
                dependencies: { '@memberjunction/ng-shared': '6.0.0' },
                mjUILayerAllow: { '@memberjunction/ng-shared': 'L3 surface awaiting relocation — MJ#3404' },
            },
            { 'a.ts': `// mj-ui-layers-allow: MJ#3404\nimport { BaseResourceComponent } from '@memberjunction/ng-shared';` },
        );
        expect((await run()).Violations).toEqual([]);
    });

    it('rejects an mjUILayerAllow entry with a blank reason', async () => {
        writePackage(
            'w',
            { mjUILayer: 'widgets', dependencies: { '@angular/router': '21.1.3' }, mjUILayerAllow: { '@angular/router': '   ' } },
            { 'a.ts': 'export const x = 1;' },
        );
        const result = await run();
        expect(result.Violations).toHaveLength(1);
        expect(result.Violations[0].Message).toContain('empty "mjUILayerAllow" reason');
    });

    it('flags a zero-arg RunView but NOT one given a provider', async () => {
        // Regression: an earlier pattern flagged `new RunView(provider)`, which is correct code.
        // A gate that cries wolf is a gate that gets switched off.
        writePackage('w', { mjUILayer: 'widgets' }, {
            'bad.ts': 'const rv = new RunView();',
            'good.ts': 'const rv = new RunView(this.ProviderToUse);',
        });
        const result = await run();
        expect(result.Violations).toHaveLength(1);
        expect(result.Violations[0].File).toContain('bad.ts');
    });

    it('does not flag a banned construct that only appears in a comment', async () => {
        writePackage('w', { mjUILayer: 'widgets' }, { 'a.ts': '// historically this used new RunView()\nexport const x = 1;' });
        expect((await run()).Violations).toEqual([]);
    });

    it('honours the reviewed-exception marker', async () => {
        writePackage('w', { mjUILayer: 'widgets' }, {
            'a.ts': `// mj-ui-layers-allow: tracked in #123\nimport { Router } from '@angular/router';`,
        });
        expect((await run()).Violations).toEqual([]);
    });

    it('lets the shell layer route — it IS the navigation layer', async () => {
        writePackage('s', { mjUILayer: 'shell' }, { 'a.ts': `import { Router } from '@angular/router';` });
        expect((await run()).Violations).toEqual([]);
    });

    it('reports an invalid layer value rather than ignoring it', async () => {
        writePackage('x', { mjUILayer: 'widgetz' }, { 'a.ts': 'export const x = 1;' });
        const result = await run();
        expect(result.Violations).toHaveLength(1);
        expect(result.Violations[0].Message).toContain('not one of');
    });

    describe('locking', () => {
        it('requireDeclared makes an undeclared package a violation', async () => {
            writePackage('undeclared', {}, { 'a.ts': 'export const x = 1;' });
            const result = await run({ requireDeclared: true });
            expect(result.Violations).toHaveLength(1);
            expect(result.Violations[0].Message).toContain('no "mjUILayer" declaration');
        });

        it('requireDeclaredIn locks only the named subtree', async () => {
            // The shape a real migration takes: one tree clean and locked, the rest still adopting.
            mkdirSync(join(repo, 'packages', 'Angular'), { recursive: true });
            const lockedDir = join(repo, 'packages', 'Angular', 'locked');
            mkdirSync(join(lockedDir, 'src'), { recursive: true });
            writeFileSync(join(lockedDir, 'package.json'), JSON.stringify({ name: '@demo/locked' }));
            writeFileSync(join(lockedDir, 'src', 'a.ts'), 'export const x = 1;');
            writePackage('elsewhere', {}, { 'a.ts': 'export const x = 1;' });

            const result = await run({ requireDeclaredIn: ['packages/Angular'] });
            expect(result.Violations).toHaveLength(1);
            expect(result.Violations[0].Package).toBe('@demo/locked');
        });
    });
});

describe('ProbeUndeclaredPackages', () => {
    it('offers the strictest honest layer', async () => {
        writePackage('pure', {}, { 'a.ts': 'export const x = 1;' });
        const [probe] = ProbeUndeclaredPackages(repo, ['packages']);
        expect(probe.WouldPassAs[0]).toBe('runtime');
    });

    it('offers widgets for a clean Angular package', async () => {
        writePackage('w', {}, { 'a.ts': `import { Component } from '@angular/core';` });
        const [probe] = ProbeUndeclaredPackages(repo, ['packages']);
        expect(probe.WouldPassAs[0]).toBe('widgets');
    });

    it('NEVER offers shell, even though every package would pass as shell', async () => {
        // Regression, caught by a two-package test repo: an earlier version declared a
        // deliberately non-compliant package as `shell` — which checks nothing — handing it a
        // permanent exemption and producing a green check that meant nothing.
        writePackage('dirty', { dependencies: { '@angular/router': '21.1.3' } }, {
            'a.ts': `import { Router } from '@angular/router';\nconst rv = new RunView();`,
        });
        const [probe] = ProbeUndeclaredPackages(repo, ['packages']);
        expect(probe.WouldPassAs).not.toContain('shell');
        expect(probe.WouldPassAs).toEqual([]);
    });

    it('ignores packages that already declare a layer', async () => {
        writePackage('declared', { mjUILayer: 'widgets' }, { 'a.ts': 'export const x = 1;' });
        expect(ProbeUndeclaredPackages(repo, ['packages'])).toEqual([]);
    });
});
