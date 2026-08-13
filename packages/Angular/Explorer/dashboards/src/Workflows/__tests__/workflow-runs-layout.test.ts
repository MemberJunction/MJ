/**
 * Layout preferences for the Runs surface.
 *
 * Pane sizes are the kind of preference people notice only when it breaks: someone drags the list
 * narrow to read a graph, and it is back to 40/60 next time. The rules worth pinning are the ones
 * that fail quietly — a stored value that no longer makes sense restoring a pane the user cannot
 * find, and a close/reopen silently discarding a size they chose.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { WorkflowRunLayout } from '../components/workflow-run-layout';

/** Preferences held in memory: these tests are about the RULES, not the settings engine. */
const settings = new Map<string, string>();

const layout = () => new WorkflowRunLayout({
    Get: (key) => settings.get(key),
    Set: (key, value) => { settings.set(key, value); },
});

const restore = (c: WorkflowRunLayout) => c.Restore();

describe('Runs layout preferences', () => {
    beforeEach(() => settings.clear());

    it('restores a saved split', async () => {
        settings.set('mj.workflowRuns.splitSizes.v1', JSON.stringify([25, 75]));
        const c = layout();
        restore(c);
        expect(c.SplitSizes).toEqual([25, 75]);
    });

    it('ignores a stored size that would hide a pane', async () => {
        // A pane restored to 0% is a pane the user cannot find again, with no obvious way back.
        // Falling back to the default is always recoverable.
        settings.set('mj.workflowRuns.splitSizes.v1', JSON.stringify([0, 100]));
        const c = layout();
        restore(c);
        expect(c.SplitSizes).toEqual([40, 60]);
    });

    it('ignores a stored value that is not a usable pair', async () => {
        for (const bad of ['not json', '{}', '[50]', '[null,null]', '["a","b"]']) {
            settings.set('mj.workflowRuns.splitSizes.v1', bad);
            const c = layout();
            restore(c);
            expect(c.SplitSizes).toEqual([40, 60]);
        }
    });

    it('keeps the step panel open unless it was explicitly closed', async () => {
        const open = layout();
        restore(open);
        expect(open.StepPanelOpen).toBe(true);

        settings.set('mj.workflowRuns.stepPanelOpen.v1', 'false');
        const closed = layout();
        restore(closed);
        expect(closed.StepPanelOpen).toBe(false);
    });

    it('defaults the legend OFF in a run, and remembers being turned on', async () => {
        const c = layout();
        restore(c);
        expect(c.ShowLegend).toBe(false);

        c.ToggleLegend();
        const next = layout();
        restore(next);
        expect(next.ShowLegend).toBe(true);
    });

    it('KEEPS the step pane size across a close and reopen', async () => {
        // Restoring a default here instead of the size someone dragged to is the small betrayal that
        // stops people using the control. Size and openness are stored separately for this reason.
        const c = layout();
        c.OnStepSplitDragEnd([70, 30]);
        c.ToggleStepPanel();
        expect(c.StepPanelOpen).toBe(false);
        c.ToggleStepPanel();
        expect(c.StepPanelOpen).toBe(true);
        expect(c.StepSplitSizes).toEqual([70, 30]);
    });

    it('persists a drag so the next visit opens the same way', async () => {
        const c = layout();
        c.OnSplitDragEnd([30, 70]);
        const next = layout();
        restore(next);
        expect(next.SplitSizes).toEqual([30, 70]);
    });

    it('ignores a drag reported with an auto-sized area', async () => {
        // angular-split reports `'*'` for an area with no explicit size; storing that would write a
        // pair that fails validation on the next read and silently reset the layout.
        const c = layout();
        c.OnSplitDragEnd([50, '*']);
        expect(c.SplitSizes).toEqual([40, 60]);
        expect(settings.has('mj.workflowRuns.splitSizes.v1')).toBe(false);
    });
});
