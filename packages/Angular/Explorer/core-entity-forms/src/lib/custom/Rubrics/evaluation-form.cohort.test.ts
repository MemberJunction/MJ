import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('evaluation form cohort', () => {
    it('gives the comparison matrix the cohort inputs instead of one query per score list', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'evaluation-form.component.ts'), 'utf8');
        expect(source).toContain('[Provider]="Form.ProviderToUse"');
        expect(source).toContain('[RubricId]="Form.record.RubricID"');
        expect(source).toContain('[Major]="Form.record.RubricMajorVersion"');
        expect(source).toContain('[SubjectEntityId]="Form.record.SubjectEntityID"');
        expect(source).toContain('[ViewerStatus]="Form.record.Status"');
        expect(source).toContain('[ViewerEvaluationId]="Form.record.ID"');
        expect(source).toContain('hiddenFieldNames: [...HIDDEN_DRAFT_EVALUATION_FIELDS]');
        expect(source).not.toContain('fieldname^="Cohort"');
        expect(source).toContain("'CohortEvaluationCount'");
        expect(source).toContain("'CohortMeanScore'");
        expect(source).toContain("'DeviationFromCohortMean'");
        expect(source).not.toContain('SubjectRecordID=');
        expect(source).not.toContain('RubricVersionID=\'${this.record.RubricVersionID}\' AND ContextRecordID');
        expect(source).not.toMatch(/cohort\.map/);
    });
});
