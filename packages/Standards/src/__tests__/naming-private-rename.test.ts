import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * End-to-end tests for `scripts/naming-private-rename.mjs`, run as a process.
 *
 * These cover the runtime-string guard specifically. A private field addressed by string is the
 * one shape where a rename compiles clean and fails at runtime: `private` is a compile-time
 * notion, and `BaseEngine` keys its configs and its observers on plain strings.
 */

const CODEMOD = resolve(__dirname, '../../scripts/naming-private-rename.mjs');

let repo: string;

beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'mj-private-'));
    mkdirSync(join(repo, 'packages', 'eng'), { recursive: true });
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

function fixture(source: string, renames: Array<{ Line: number; Old: string; New: string }>): string {
    const file = 'packages/eng/engine.ts';
    writeFileSync(join(repo, file), source);
    writeFileSync(
        join(repo, 'findings.json'),
        JSON.stringify({
            Findings: renames.map((r) => ({
                File: file,
                Line: r.Line,
                Severity: 'error',
                Message: `private member "${r.Old}" is PascalCase — private members are camelCase; rename to "${r.New}"`,
            })),
        }),
    );
    return file;
}

const runCodemod = (apply = true): string =>
    execFileSync(
        process.execPath,
        [CODEMOD, '--findings', 'findings.json', '--package', 'packages/eng', ...(apply ? ['--apply'] : [])],
        { cwd: repo, encoding: 'utf8' },
    );

describe('naming-private-rename — runtime-string guard', () => {
    it('refuses a field whose name appears only in an equality test', () => {
        // The shape that shipped as a bug in UserInfoEngine: the config PropertyName moved to the
        // new name, but `c.PropertyName === '<old>'` did not, so the lookup silently stopped
        // matching and the notification it guarded was skipped. No API name appears here, which
        // is why matching a known call list is not enough.
        const file = fixture(
            'export class Engine {\n' +
                '    private _OnlyEquality: string[] = [];\n' +
                '    public Uninstall(): void {\n' +
                "        const config = this.Configs.find((c) => c.PropertyName === '_OnlyEquality');\n" +
                '        if (config) this.notify(config);\n' +
                '    }\n' +
                "    public Bump(): void { this._OnlyEquality.push('x'); }\n" +
                '    public Configs: Array<{ PropertyName: string }> = [];\n' +
                '    private notify(_c: unknown): void {}\n' +
                '}\n',
            [{ Line: 2, Old: '_OnlyEquality', New: '_onlyEquality' }],
        );

        const output = runCodemod();
        expect(output).toMatch(/renamed\s+:\s+0/);
        expect(output).toContain('string literal');
        expect(readFileSync(join(repo, file), 'utf8')).toContain('private _OnlyEquality: string[]');
    });

    it('refuses a field passed to emitPropertyChange', () => {
        fixture(
            'export class Engine {\n' +
                '    private _Watched: string[] = [];\n' +
                "    public Repair(): void { this.emitPropertyChange('_Watched'); }\n" +
                '    public Len(): number { return this._Watched.length; }\n' +
                '    protected emitPropertyChange(_n: string): void {}\n' +
                '}\n',
            [{ Line: 2, Old: '_Watched', New: '_watched' }],
        );
        expect(runCodemod(false)).toMatch(/renamed\s+:\s+0/);
    });

    it('still renames a field no string literal in the file mentions', () => {
        // The guard has to stay narrow enough to be useful: only the name actually spelled as a
        // string is refused, not every private field in a file that happens to contain strings.
        const file = fixture(
            'export class Engine {\n' +
                '    private _Harmless: number = 0;\n' +
                "    public Setup(): void { this.Configs.push({ PropertyName: '_somethingElse' }); }\n" +
                '    public Bump(): void { this._Harmless++; }\n' +
                '    public Configs: Array<{ PropertyName: string }> = [];\n' +
                '}\n',
            [{ Line: 2, Old: '_Harmless', New: '_harmless' }],
        );
        expect(runCodemod()).toMatch(/renamed\s+:\s+1/);
        const result = readFileSync(join(repo, file), 'utf8');
        expect(result).toContain('private _harmless: number = 0;');
        expect(result).toContain('this._harmless++;');
    });
});
