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
});
