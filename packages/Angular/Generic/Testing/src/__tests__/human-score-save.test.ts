import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('human rubric score save', () => {
    it('assigns the evaluation and score entities and checks the view', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/components/test-feedback-dialog.component.ts'), 'utf8');
        expect(source).toContain('MJRubricEvaluationEntity');
        expect(source).toContain('MJRubricEvaluationScoreEntity');
        expect(source).not.toMatch(/\.Set\(/);
        expect(source).not.toMatch(/\.Get\(/);
        expect(source).toContain('evaluation.Status = \'Submitted\'');
        expect(source).toContain('result.Success');
        expect(source).toContain('score.Save()');
    });
});
