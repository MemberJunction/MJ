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
        expect(review).toContain('evaluations.Success');
        expect(analytics).toContain('RubricAnalyticsError');
        expect(analytics).toContain('VersionMetricsError');
        expect(analytics).toContain('runs.Success');
        expect(drift).toContain('LoadError');
        expect(drift).toContain('scores.Success');
    });
});
