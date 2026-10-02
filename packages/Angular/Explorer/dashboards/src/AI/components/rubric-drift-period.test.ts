import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { driftDeltas } from '@memberjunction/rubrics-base';
import { DriftPeriodRows } from './rubric-drift-series';

describe('drift period means', () => {
    it('names the agent, rubric, and criterion and alerts on the drop', () => {
        const directory = dirname(fileURLToPath(import.meta.url));
        const sql = readFileSync(join(directory, '../../../../../../../metadata/queries/SQL/rubric-drift-period-means.sql'), 'utf8');
        expect(sql).toContain("evaluation.[Status] = 'Submitted'");
        expect(sql).toContain("evaluation.[EvaluatorType] <> 'Self'");
        expect(sql).toContain('GROUP BY agent.[Name], rubric.[Name], criterion.[Key]');
        const periods = DriftPeriodRows([
            { AgentName: 'Researcher', RubricName: 'Answer quality', CriterionKey: 'cites-sources', CurrentMean: 0.4, PreviousMean: 0.9 },
            { AgentName: 'Researcher', RubricName: 'Answer quality', CriterionKey: 'complete', CurrentMean: null, PreviousMean: 1 },
        ]);
        expect(periods.current).toEqual([{ key: 'Researcher · Answer quality · cites-sources', mean: 0.4 }]);
        expect(periods.previous.map(row => row.key)).toEqual([
            'Researcher · Answer quality · cites-sources',
            'Researcher · Answer quality · complete',
        ]);
        expect(periods.current[0].key).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
        const alerts = driftDeltas(periods.current, periods.previous, 0.2).filter(row => row.alert);
        expect(alerts.map(row => row.key)).toEqual(['Researcher · Answer quality · cites-sources']);
        const screen = readFileSync(join(directory, 'rubric-drift.component.ts'), 'utf8');
        expect(screen).toContain('role="alert"');
        expect(screen).toContain('row.alert');
    });
});
