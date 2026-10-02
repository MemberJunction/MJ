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

    it('does not gate rolled-back SQL checks, and still gates durable writes', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../checks/rubrics.checks.ts'), 'utf8');
        const head = (id: string) => {
            const start = source.indexOf(`Id: 'rubrics.${id}'`);
            return source.slice(start, source.indexOf('Fn:', start));
        };
        for (const id of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R10']) {
            expect(head(id)).not.toMatch(/RequiresMutation/);
        }
        for (const id of ['R7', 'R8', 'R9', 'W1']) {
            expect(head(id)).toMatch(/RequiresMutation: true/);
        }
    });
});
