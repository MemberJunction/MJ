import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * End-to-end tests for `scripts/naming-type-member-rename.mjs`, run as a process.
 *
 * These cover the template guard. This pass rests on the TypeScript language service seeing
 * every use, which holds right up until a package sets `strictTemplates: false` — then Angular
 * type-checks no template expression at all and the checker is blind to every binding.
 */

const CODEMOD = resolve(__dirname, '../../scripts/naming-type-member-rename.mjs');

const SOURCE =
    'interface Card {\n' +
    '    bindingId: string;\n' +
    '    label: string;\n' +
    '}\n' +
    'export class Panel {\n' +
    '    public Cards: Card[] = [];\n' +
    "    public Add(): void { this.Cards.push({ bindingId: 'a', label: 'b' }); }\n" +
    '}\n';

let repo: string;

beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'mj-typemember-'));
    mkdirSync(join(repo, 'packages', 'ui', 'src'), { recursive: true });
    writeFileSync(join(repo, 'packages/ui/src/panel.ts'), SOURCE);
    writeFileSync(
        join(repo, 'findings.json'),
        JSON.stringify({
            Findings: [
                { File: 'packages/ui/src/panel.ts', Line: 2, Severity: 'error', Message: 'exported interface member "bindingId" is not PascalCase — rename to "BindingId"' },
                { File: 'packages/ui/src/panel.ts', Line: 3, Severity: 'error', Message: 'exported interface member "label" is not PascalCase — rename to "Label"' },
            ],
        }),
    );
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

/** Writes the package tsconfig at the given template-checking mode, plus its template. */
function setup(strictTemplates: boolean, template: string): void {
    writeFileSync(
        join(repo, 'packages/ui/tsconfig.json'),
        JSON.stringify({
            compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true },
            angularCompilerOptions: { strictTemplates },
            include: ['src/**/*.ts'],
        }),
    );
    writeFileSync(join(repo, 'packages/ui/src/panel.html'), template);
}

const runCodemod = (): string =>
    execFileSync(process.execPath, [CODEMOD, '--findings', 'findings.json', '--package', 'packages/ui'], {
        cwd: repo,
        encoding: 'utf8',
    });

const READS_BOTH = '@for (card of Cards; track card.bindingId) {\n  <div>{{ card.label }}</div>\n}\n';

describe('naming-type-member-rename — template guard', () => {
    it('refuses a member an unchecked template reads', () => {
        setup(false, READS_BOTH);
        const output = runCodemod();
        expect(output).toMatch(/renamed\s+:\s+0/);
        expect(output).toContain('strictTemplates');
    });

    it('renames when the package type-checks its templates, since the compiler would catch it', () => {
        setup(true, READS_BOTH);
        expect(runCodemod()).toMatch(/renamed\s+:\s+2/);
    });

    it('renames in an unchecked package when no template reads the name', () => {
        // The guard has to stay narrow: `strictTemplates: false` alone is not a reason to refuse.
        setup(false, '<div>static markup only</div>\n');
        expect(runCodemod()).toMatch(/renamed\s+:\s+2/);
    });
});
