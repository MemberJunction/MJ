import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveExportedBindings, findRegisteredClasses, resolveSpecifier } from '../check-registerclass-exports.mjs';
import ts from 'typescript';

/* ------------------------------------------------------------------ *
 * Fixture helpers — a throwaway package tree per test.
 * ------------------------------------------------------------------ */

let root;

function write(rel, content) {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
    return full;
}

/** Resolve the entry's exported bindings and flatten to the provenance set. */
function provenanceOf(entryPath) {
    const state = { cache: new Map(), unresolvableStar: false, namespaceOnly: new Set() };
    const bindings = resolveExportedBindings(entryPath, state);
    const prov = new Set();
    for (const set of bindings.values()) for (const p of set) prov.add(p);
    return { prov, bindings, state };
}

function parse(file, text) {
    writeFileSync(file, text);
    return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}

beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'rc-gate-'));
});

afterAll(() => {
    rmSync(root, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ *
 * Decorator detection
 * ------------------------------------------------------------------ */

describe('findRegisteredClasses', () => {
    it('finds a @RegisterClass class and records whether it is locally exported', () => {
        const f = join(root, 'a.ts');
        const sf = parse(
            f,
            `import { RegisterClass } from 'x';
             @RegisterClass(Base, 'k')
             export class Exported {}
             @RegisterClass(Base, 'k2')
             class NotExported {}`
        );
        const found = findRegisteredClasses(sf);
        expect(found.map((c) => c.className).sort()).toEqual(['Exported', 'NotExported']);
        expect(found.find((c) => c.className === 'Exported').isExported).toBe(true);
        expect(found.find((c) => c.className === 'NotExported').isExported).toBe(false);
    });

    it('ignores @RegisterClass occurrences in comments and string literals', () => {
        // The repo contains 433 commented-out and 258 in-string occurrences; a regex
        // sweep would count them as real registrations.
        const f = join(root, 'b.ts');
        const sf = parse(
            f,
            `// @RegisterClass(Base, 'commented')
             /* @RegisterClass(Base, 'blockComment') */
             const doc = '@RegisterClass(Base, "inString")';
             const tpl = \`@RegisterClass(Base, 'inTemplate')\`;
             export class Plain {}`
        );
        expect(findRegisteredClasses(sf)).toHaveLength(0);
    });

    it('does not treat a same-named non-RegisterClass decorator as a registration', () => {
        const f = join(root, 'c.ts');
        const sf = parse(f, `@Component({}) export class Comp {}`);
        expect(findRegisteredClasses(sf)).toHaveLength(0);
    });
});

/* ------------------------------------------------------------------ *
 * Specifier resolution
 * ------------------------------------------------------------------ */

describe('resolveSpecifier', () => {
    it('resolves plain, NodeNext .js, and directory-barrel specifiers', () => {
        write('pkg/src/lib/thing.ts', 'export class T {}');
        write('pkg/src/lib/dir/index.ts', 'export class D {}');
        const from = write('pkg/src/entry.ts', '');

        expect(resolveSpecifier(from, './lib/thing')).toBe(join(root, 'pkg/src/lib/thing.ts'));
        expect(resolveSpecifier(from, './lib/thing.js')).toBe(join(root, 'pkg/src/lib/thing.ts'));
        expect(resolveSpecifier(from, './lib/dir')).toBe(join(root, 'pkg/src/lib/dir/index.ts'));
    });

    it('returns null for bare (cross-package) specifiers', () => {
        const from = write('pkg2/src/entry.ts', '');
        expect(resolveSpecifier(from, '@memberjunction/core')).toBeNull();
    });
});

/* ------------------------------------------------------------------ *
 * Export-graph resolution
 * ------------------------------------------------------------------ */

describe('resolveExportedBindings', () => {
    it('follows `export *` chains transitively', () => {
        write('t1/deep.ts', 'export class Deep {}');
        write('t1/mid.ts', "export * from './deep';");
        const entry = write('t1/entry.ts', "export * from './mid';");
        const { prov } = provenanceOf(entry);
        expect(prov.has(`${join(root, 't1/deep.ts')}#Deep`)).toBe(true);
    });

    it('follows named re-exports and preserves provenance through an alias', () => {
        write('t2/impl.ts', 'export class Real {}');
        const entry = write('t2/entry.ts', "export { Real as Renamed } from './impl';");
        const { prov, bindings } = provenanceOf(entry);
        expect(bindings.has('Renamed')).toBe(true);
        // Aliased, but still traceable to the original declaration.
        expect(prov.has(`${join(root, 't2/impl.ts')}#Real`)).toBe(true);
    });

    it('resolves a local export clause over an import', () => {
        write('t3/impl.ts', 'export class Wrapped {}');
        const entry = write('t3/entry.ts', "import { Wrapped } from './impl';\nexport { Wrapped };");
        const { prov } = provenanceOf(entry);
        expect(prov.has(`${join(root, 't3/impl.ts')}#Wrapped`)).toBe(true);
    });

    it('distinguishes two same-named classes in different files by provenance', () => {
        // This is why provenance exists: exporting file A's `Dup` must NOT make
        // file B's identically-named `Dup` count as exported.
        write('t4/a.ts', 'export class Dup {}');
        write('t4/b.ts', 'export class Dup {}');
        const entry = write('t4/entry.ts', "export * from './a';");
        const { prov } = provenanceOf(entry);
        expect(prov.has(`${join(root, 't4/a.ts')}#Dup`)).toBe(true);
        expect(prov.has(`${join(root, 't4/b.ts')}#Dup`)).toBe(false);
    });

    it('REGRESSION: a file reached by two sibling branches still resolves', () => {
        // The original bug: the visited-set was threaded down the recursion and
        // never unwound, so the second branch to reach `shared.ts` saw it as a
        // cycle and resolved it to "exports nothing" — reporting every class
        // behind it as unexported. This is the ng-dashboards failure shape
        // (22 false positives) in miniature.
        write('t5/shared.ts', 'export class Shared {}');
        write('t5/first.ts', "export * from './shared';");
        write('t5/second.ts', "export * from './shared';");
        const entry = write('t5/entry.ts', "export * from './first';\nexport * from './second';");
        const { prov } = provenanceOf(entry);
        expect(prov.has(`${join(root, 't5/shared.ts')}#Shared`)).toBe(true);
    });

    it('REGRESSION: a star pass before a named re-export does not blank it out', () => {
        // Exactly ng-dashboards: `export * from './DataExplorer'` walks into a
        // shared file, then `export { X } from './AI/index'` must still resolve.
        write('t6/target.ts', 'export class Target {}');
        write('t6/barrel.ts', "export * from './target';");
        write('t6/other.ts', "export * from './barrel';");
        const entry = write('t6/entry.ts', "export * from './other';\nexport { Target } from './barrel';");
        const { prov } = provenanceOf(entry);
        expect(prov.has(`${join(root, 't6/target.ts')}#Target`)).toBe(true);
    });

    it('terminates on a circular barrel graph', () => {
        write('t7/a.ts', "export * from './b';\nexport class A {}");
        write('t7/b.ts', "export * from './a';\nexport class B {}");
        const entry = write('t7/entry.ts', "export * from './a';");
        const { prov } = provenanceOf(entry); // must not hang or throw
        expect(prov.has(`${join(root, 't7/a.ts')}#A`)).toBe(true);
    });

    it('treats `export * as ns` as namespace-only, not a named export', () => {
        // A manifest emits `import { Foo } from 'pkg'`, which a namespace
        // re-export does not satisfy.
        write('t8/impl.ts', 'export class NsOnly {}');
        const entry = write('t8/entry.ts', "export * as ns from './impl';");
        const { prov, state } = provenanceOf(entry);
        expect(prov.has(`${join(root, 't8/impl.ts')}#NsOnly`)).toBe(false);
        expect(state.namespaceOnly.has(`${join(root, 't8/impl.ts')}#NsOnly`)).toBe(true);
    });

    it('flags an unresolvable cross-package `export *` so misses degrade to UNCERTAIN', () => {
        const entry = write('t9/entry.ts', "export * from '@memberjunction/somewhere-else';");
        const { state } = provenanceOf(entry);
        expect(state.unresolvableStar).toBe(true);
    });

    it('does not count a class that is declared but never exported', () => {
        write('t10/impl.ts', 'class Hidden {}\nexport class Visible {}');
        const entry = write('t10/entry.ts', "export * from './impl';");
        const { prov } = provenanceOf(entry);
        expect(prov.has(`${join(root, 't10/impl.ts')}#Hidden`)).toBe(false);
        expect(prov.has(`${join(root, 't10/impl.ts')}#Visible`)).toBe(true);
    });
});
