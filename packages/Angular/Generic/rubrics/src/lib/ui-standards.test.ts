import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const directory = dirname(fileURLToPath(import.meta.url));

describe('rubric widget standards', () => {
    it('does not query the document or write back to inputs from ngOnChanges', () => {
        const builder = readFileSync(join(directory, 'rubric-builder.component.ts'), 'utf8');
        const editors = readFileSync(join(directory, 'record-editors.component.ts'), 'utf8');
        const matrix = readFileSync(join(directory, 'comparison-matrix.component.ts'), 'utf8');
        for (const source of [builder, editors, matrix]) {
            expect(source).not.toContain('document.querySelectorAll');
        }
        expect(builder).not.toMatch(/this\.SampleAnswers\s*=/);
        expect(matrix).not.toMatch(/this\.Columns\s*=/);
        expect(matrix).not.toMatch(/this\.Keys\s*=/);
    });

    it('exports the version board and quotes filters with EscapeSQLString', () => {
        const moduleSource = readFileSync(join(directory, 'rubrics.module.ts'), 'utf8');
        const hosts = readFileSync(join(directory, 'form-hosts.component.ts'), 'utf8');
        const model = readFileSync(join(directory, 'model.ts'), 'utf8');
        expect(moduleSource).toMatch(/exports:\s*\[[\s\S]*RubricVersionBoardComponent/);
        expect(hosts).toContain('EscapeSQLString');
        expect(model).toContain('EscapeSQLString');
        expect(hosts).not.toContain(".replace(/'/g");
        expect(model).not.toContain(".replace(/'/g");
    });

    it('only describes matrix figures the template renders', () => {
        const readme = readFileSync(join(directory, '../../README.md'), 'utf8');
        const template = readFileSync(join(directory, 'comparison-matrix.component.html'), 'utf8');
        expect(template).toContain('Model.humanMean');
        expect(template).toContain('Model.aiMean');
        expect(template).toContain('Model.selfScore');
        expect(readme).toContain('self mean');
        expect(readme).not.toContain('stays out of them');
    });
});
