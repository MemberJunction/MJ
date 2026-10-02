import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const directory = dirname(fileURLToPath(import.meta.url));

describe('rubric catalog standards', () => {
    it('loads with mj-loading, AG Grid, batched views, and inject()', () => {
        const rubricsHtml = readFileSync(join(directory, 'rubrics-dashboard.component.html'), 'utf8');
        const scalesHtml = readFileSync(join(directory, 'scales-dashboard.component.html'), 'utf8');
        const rubrics = readFileSync(join(directory, 'rubrics-dashboard.component.ts'), 'utf8');
        const scales = readFileSync(join(directory, 'scales-dashboard.component.ts'), 'utf8');
        const drift = readFileSync(join(directory, '../AI/components/rubric-drift.component.ts'), 'utf8');
        for (const html of [rubricsHtml, scalesHtml]) {
            expect(html).toContain('<mj-loading');
            expect(html).toContain('<ag-grid-angular');
            expect(html).not.toContain('<p>Loading');
            expect(html).not.toContain('<table');
        }
        for (const source of [rubrics, scales]) {
            expect(source).toContain('inject(ChangeDetectorRef)');
            expect(source).not.toMatch(/constructor\s*\(/);
            expect(source).toContain('.RunViews(');
            expect(source).not.toContain('Promise.all');
            expect(source).toContain('SetAgentContext');
        }
        expect(drift).toContain('SetAgentContext');
    });
});
