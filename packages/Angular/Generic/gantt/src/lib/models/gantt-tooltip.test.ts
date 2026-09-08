import { afterEach, describe, expect, it } from 'vitest';
import {
    BuildGanttTaskTooltipHtml,
    EnsureGanttTooltipStyles,
    EscapeGanttHtml,
    GANTT_GRID_CELL_TOOLTIP_SELECTOR,
} from './gantt-tooltip';

describe('Gantt tooltip helpers', () => {
    afterEach(() => {
        document.getElementById('mj-gantt-tooltip-style')?.remove();
    });

    it('targets grid cells by column name', () => {
        expect(GANTT_GRID_CELL_TOOLTIP_SELECTOR).toBe('.gantt_cell[data-column-name]');
    });

    it('escapes HTML so task names cannot inject markup', () => {
        expect(EscapeGanttHtml(`Website <b>Redesign</b> & "Portal"`)).toBe(
            'Website &lt;b&gt;Redesign&lt;/b&gt; &amp; &quot;Portal&quot;',
        );
    });

    it('returns empty HTML when the name is blank', () => {
        expect(BuildGanttTaskTooltipHtml({ Name: '   ' })).toBe('');
    });

    it('renders the full name without dates when only the name is provided', () => {
        const html = BuildGanttTaskTooltipHtml({ Name: 'Website Redesign & Portal Launch' });
        expect(html).toContain('Website Redesign &amp; Portal Launch');
        expect(html).not.toContain('mj-gantt-tooltip__meta');
    });

    it('appends a date range and percent when those fields are present', () => {
        const html = BuildGanttTaskTooltipHtml({
            Name: 'Website Redesign & Portal Launch',
            Start: new Date(2026, 7, 1),
            End: new Date(2026, 7, 31),
            Progress: 0.45,
        });
        expect(html).toContain('mj-gantt-tooltip__meta');
        expect(html).toContain('45%');
        expect(html).toMatch(/Aug\s+1,\s+2026/);
        expect(html).toMatch(/Aug\s+31,\s+2026/);
    });

    it('treats progress values already in percent as percent', () => {
        const html = BuildGanttTaskTooltipHtml({
            Name: 'Task',
            Progress: 80,
        });
        expect(html).toContain('80%');
    });

    it('injects body-level tooltip styles once', () => {
        EnsureGanttTooltipStyles();
        EnsureGanttTooltipStyles();
        const nodes = document.querySelectorAll('#mj-gantt-tooltip-style');
        expect(nodes.length).toBe(1);
        expect(nodes[0]?.textContent).toContain('.gantt_tooltip');
        expect(nodes[0]?.textContent).toContain('white-space: normal');
    });
});
