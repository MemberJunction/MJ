import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('rubric load failures', () => {
    it('shows the error instead of an empty catch', () => {
        const directory = dirname(fileURLToPath(import.meta.url));
        const review = readFileSync(join(directory, 'testing-review.component.ts'), 'utf8');
        const analytics = readFileSync(join(directory, 'testing-analytics.component.ts'), 'utf8');
        const drift = readFileSync(join(directory, '../../AI/components/rubric-drift.component.ts'), 'utf8');
        for (const source of [review, analytics, drift]) {
            expect(source).not.toMatch(/catch\s*\{/);
        }
        expect(review).toContain('DisagreementError');
        expect(review).toContain('scores.Success');
        expect(review).toContain('CohortDisagreement');
        expect(review).toContain('CriterionCohortHumanMeanScore');
        expect(review).toContain('CriterionKey <code>{{ row.key }}</code>');
        expect(review).toContain("OpenEntityRecord('MJ: Test Runs'");
        expect(review).not.toContain('disagreementFromScores');
        expect(analytics).toContain('RubricAnalyticsError');
        expect(analytics).toContain('VersionMetricsError');
        expect(analytics).toContain('evaluations.Success');
        expect(analytics).toContain('RubricScoreTrend');
        expect(analytics).toContain('CriterionKey <code>{{ rate.key }}</code>');
        expect(analytics).toContain("OpenEntityRecord('MJ: Test Runs'");
        expect(analytics).not.toContain('MJ: Test Suite Runs');
        expect(analytics).not.toContain('runs.Success');
        expect(drift).toContain('LoadError');
        expect(drift).toContain("QueryName: 'RubricDriftPeriodMeans'");
        expect(drift).toContain('result.Success');
        expect(drift).not.toContain('MaxRows: 1000');
    });
});
