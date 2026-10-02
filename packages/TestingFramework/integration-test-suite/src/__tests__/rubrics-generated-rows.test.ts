import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('rubrics integration rows', () => {
    it('loads rows as generated classes and does not cast them through RubricRow', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../checks/rubrics.checks.ts'), 'utf8');
        expect(source).not.toMatch(/RubricRow/);
        expect(source).toMatch(/GetEntityObject<MJRubricEvaluationEntity>/);
        expect(source).toMatch(/entityName: 'MJ: Rubric Criteria'\)/);
    });

    it('rolls back the IT world agent, test, and evaluations', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../checks/rubrics.checks.ts'), 'utf8');
        const world = source.slice(source.indexOf('async function ensureItWorld'), source.indexOf('async function ensureItWorldDetails'));
        expect(world).toMatch(/retireItWorldAttachments/);
        const rolled = world.slice(world.indexOf('withProviderRollback'));
        expect(rolled).toMatch(/agent\.Status = 'Active'/);
        expect(rolled).toMatch(/test\.Status = 'Active'/);
        expect(rolled).toMatch(/evaluation\.Status = 'Submitted'/);
        expect(rolled.indexOf('withProviderRollback')).toBeLessThan(rolled.indexOf("agent.Status = 'Active'"));
    });
});
