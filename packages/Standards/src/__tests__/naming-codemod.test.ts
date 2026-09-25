import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * End-to-end tests for `scripts/naming-codemod.mjs`.
 *
 * The script is repo tooling the naming guide tells developers to run, and it is invoked as a
 * process, so these tests run the committed file rather than importing pieces of it. That is
 * deliberate: the regression these cover was a free variable in `rewriteProperty` — valid to
 * every linter, a `ReferenceError` only when the branch actually ran. `rewriteFile` is wrapped
 * in a try/catch that turns any throw into "skipped", so the script still exited 0 and merely
 * reported that it had fixed nothing.
 */

const CODEMOD = resolve(__dirname, '../../scripts/naming-codemod.mjs');

let repo: string;

beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'mj-codemod-'));
    mkdirSync(join(repo, 'packages', 'fix'), { recursive: true });
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

/** Writes one source file plus the worklist naming the members to rename. */
function fixture(source: string, findings: Array<{ Line: number; Old: string; New: string }>): string {
    const file = 'packages/fix/fixture.ts';
    writeFileSync(join(repo, file), source);
    writeFileSync(
        join(repo, 'findings.json'),
        JSON.stringify({
            Findings: findings.map((f) => ({
                File: file,
                Line: f.Line,
                Severity: 'error',
                Message: `public member "${f.Old}" is not PascalCase — rename to "${f.New}"`,
            })),
        }),
    );
    return file;
}

function runCodemod(apply = true): string {
    return execFileSync(
        process.execPath,
        [CODEMOD, '--findings', 'findings.json', '--package', 'packages/fix', ...(apply ? ['--apply'] : [])],
        { cwd: repo, encoding: 'utf8' },
    );
}

describe('naming-codemod — class members', () => {
    it('renames a property and a method in the same file, leaving forwarding stubs', () => {
        const file = fixture(
            'export class Thing {\n    public foo: string = "a";\n    public bar(): number {\n        return 1;\n    }\n}\n',
            [
                { Line: 2, Old: 'foo', New: 'Foo' },
                { Line: 3, Old: 'bar', New: 'Bar' },
            ],
        );

        const output = runCodemod();
        expect(output).toMatch(/fixed\s+:\s+2/);
        expect(output).toMatch(/skipped in scope\s+:\s+0/);

        const result = readFileSync(join(repo, file), 'utf8');
        // The new name carries the real declaration...
        expect(result).toContain('public Foo: string = "a";');
        expect(result).toContain('public Bar(): number');
        // ...and the old one forwards to it.
        expect(result).toContain('public get foo(): string {');
        expect(result).toContain('return this.Foo;');
        expect(result).toContain('public set foo(value: string) {');
        expect(result).toContain('this.Foo = value;');
        expect(result).toContain('return this.Bar();');
        // A plain property is never an Angular input, so its stub must not be decorated.
        expect(result).not.toContain('@Input()');
    });

    it('reports no codemod error, and does not abort the rest of the file', () => {
        fixture(
            'export class Thing {\n    public foo: string = "a";\n    public bar(): number {\n        return 1;\n    }\n}\n',
            [
                { Line: 2, Old: 'foo', New: 'Foo' },
                { Line: 3, Old: 'bar', New: 'Bar' },
            ],
        );
        // `rewriteFile` is wrapped in a try/catch that marks EVERY finding in the file skipped,
        // so one throw on the property also loses the method beside it. The class carries a
        // method for a second reason: without one it would be refused as a data shape and the
        // property branch would never run at all.
        const output = runCodemod(false);
        expect(output).not.toMatch(/codemod error/);
        expect(output).toMatch(/fixed\s+:\s+2/);
    });

    it('gives a readonly property a getter stub only, since readonly already meant that', () => {
        // The class needs a method: a class of nothing but data is treated as a declared data
        // shape, and those are refused outright because object literals get assigned to them.
        const file = fixture(
            'export class Thing {\n    public readonly foo: string = "a";\n    public keep(): void {}\n}\n',
            [{ Line: 2, Old: 'foo', New: 'Foo' }],
        );
        runCodemod();
        const result = readFileSync(join(repo, file), 'utf8');
        expect(result).toContain('get foo(): string {');
        expect(result).not.toContain('set foo(');
    });

    it('refuses a data-shape class, where an accessor stub would change what literals must supply', () => {
        const file = fixture(
            'export class Shape {\n    public foo: string = "a";\n}\n',
            [{ Line: 2, Old: 'foo', New: 'Foo' }],
        );
        const output = runCodemod();
        expect(output).toMatch(/fixed\s+:\s+0/);
        expect(output).toContain('declared data shape');
        expect(readFileSync(join(repo, file), 'utf8')).toContain('public foo: string = "a";');
    });
});
