import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('rubric anchor writes', () => {
    it('uses the criterion-level entity and checks save, delete, and the view', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'form-hosts.component.ts'), 'utf8');
        expect(source).toContain('MJRubricCriterionLevelEntity');
        expect(source).not.toMatch(/\.Set\(/);
        expect(source).not.toMatch(/\.Get\(/);
        expect(source).toContain('result.Success');
        expect(source).toContain('row.Save()');
        expect(source).toContain('row.Delete()');
    });
});
