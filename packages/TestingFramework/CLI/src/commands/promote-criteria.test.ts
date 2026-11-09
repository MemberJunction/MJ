import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('promote-criteria rows', () => {
    it('writes typed rubric entities inside one transaction', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'promote-criteria.ts'), 'utf8');
        expect(source).not.toMatch(/\.Set\(/);
        expect(source).not.toMatch(/\.Get\(/);
        expect(source).not.toMatch(/GetEntityObject<MJTestEntity>\('MJ: Rubrics'/);
        expect(source).toMatch(/GetEntityObject<MJRubricEntity>/);
        expect(source).toMatch(/GetEntityObject<MJRubricVersionEntity>/);
        expect(source).toMatch(/GetEntityObject<MJRubricCriterionEntity>/);
        expect(source).toMatch(/GetEntityObject<MJRubricScaleEntity>/);
        expect(source).toMatch(/GetEntityObject<MJRubricScaleLevelEntity>/);
        expect(source).toMatch(/RunInEntityTransaction/);
    });
});
