import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const template = readFileSync(new URL('../../../../../metadata/prompts/templates/computer-use/judge.template.md', import.meta.url), 'utf8');
const engine = readFileSync(new URL('../engine/MJComputerUseEngine.ts', import.meta.url), 'utf8');

describe('judge template rubric block', () => {
    it('renders rubric criteria with keys and levels ahead of plain validation criteria', () => {
        expect(template).toContain('{% if rubricCriteria and rubricCriteria.length > 0 %}');
        expect(template).toContain('[{{ criterion.Key }}]');
        expect(template).toContain("{{ criterion.Levels | join(' / ') }}");
        expect(template.indexOf('rubricCriteria')).toBeLessThan(template.indexOf('{% elif validationCriteria'));
    });

    it('is given rubricCriteria by the MJ engine', () => {
        expect(engine).toContain('rubricCriteria: request.RubricCriteria');
    });
});
