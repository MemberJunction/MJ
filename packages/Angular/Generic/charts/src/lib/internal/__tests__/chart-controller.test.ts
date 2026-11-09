import { describe, it, expect, vi, afterEach } from 'vitest';
import { ChartController, ChartControllerOptions, PointerLeaveGraceMs } from '../chart-controller';
import { ChartIssueLog } from '../issue-log';
import { ActivePoint, ChartDataStatus, ChartSurface } from '../geometry.types';
import { EstimateTextMeasure } from '../text-measure';

interface FakeGeometry { Width: number; }
const surface = (Width: number): ChartSurface => ({ Size: { Width, Height: 100 }, Measure: EstimateTextMeasure(), FontSize: 12 });
const point: ActivePoint = { CategoryIndex: 0, SeriesIndex: 0 };

function make(status: () => ChartDataStatus = () => ({ Kind: 'ok' }), pointsOf: () => ActivePoint[] = () => [point]) {
    const sink = vi.fn();
    const layout = vi.fn((s: ChartSurface): FakeGeometry => ({ Width: s.Size.Width }));
    const render = vi.fn();
    const options: ChartControllerOptions<FakeGeometry> = {
        Context: () => 'test chart "T"',
        Prepare: () => ({ Status: status(), Legend: [{ Label: 'A', Color: 'c', Key: 'k' }] }),
        Table: () => ({ Caption: 'T', ColumnHeaders: [], Rows: [], TruncatedNote: null }),
        Layout: layout,
        Points: () => pointsOf(),
        HitTest: (_g, x) => (x < 50 ? point : null),
        Navigate: (points) => points[0] ?? null,
        Describe: () => ({ Tooltip: { Title: 't', Rows: [] }, Anchor: { X: 1, Y: 2 }, Announcement: 'A, 1' }),
        RequestRender: render,
    };
    return { controller: new ChartController(options, new ChartIssueLog(sink)), sink, layout, render };
}

afterEach(() => vi.useRealTimers());

describe('ChartController.View', () => {
    it('is memoized: same object until something marks it dirty', () => {
        const { controller, layout } = make();
        controller.SetSurface(surface(300));
        const first = controller.View;
        expect(controller.View).toBe(first);
        expect(layout).toHaveBeenCalledTimes(1);
        controller.MarkDirty();
        expect(controller.View).not.toBe(first);
    });

    it('has no geometry until the frame reports a surface', () => {
        const { controller } = make();
        expect(controller.View.Status).toEqual({ Kind: 'ok' });
        expect(controller.View.Geometry).toBeNull();
        expect(controller.View.Table).not.toBeNull();
    });

    it('validates once per snapshot: two input changes in one pass produce one Prepare and no false error', () => {
        let categories = 2;
        let values = 2;
        const { controller, sink } = make(() => (categories === values ? { Kind: 'ok' } : { Kind: 'invalid', Code: 'length-mismatch', Detail: 'x' }));
        controller.SetSurface(surface(300));
        void controller.View;
        categories = 3; controller.MarkDirty();
        values = 3; controller.MarkDirty();
        expect(controller.View.Status.Kind).toBe('ok');
        expect(sink).not.toHaveBeenCalled();
    });

    it('reports an invalid status once and drops legend/table/geometry', () => {
        const { controller, sink } = make(() => ({ Kind: 'invalid', Code: 'length-mismatch', Detail: 'x' }));
        controller.SetSurface(surface(300));
        expect(controller.View.Geometry).toBeNull();
        expect(controller.View.Legend).toEqual([]);
        expect(controller.View.Table).toBeNull();
        controller.MarkDirty();
        void controller.View;
        expect(sink).toHaveBeenCalledTimes(1);
    });

    it('ignores a surface with the same size, measure and font size', () => {
        const { controller, layout } = make();
        const s = surface(300);
        controller.SetSurface(s);
        void controller.View;
        controller.SetSurface({ ...s });
        void controller.View;
        expect(layout).toHaveBeenCalledTimes(1);
    });

    it('re-lays out when only the font size changes', () => {
        const { controller, layout } = make();
        const s = surface(300);
        controller.SetSurface(s);
        void controller.View;
        controller.SetSurface({ ...s, FontSize: 18 });
        void controller.View;
        expect(layout).toHaveBeenCalledTimes(2);
    });
});

describe('ChartController pointer + keyboard', () => {
    it('hover builds a description; leaving clears it after the grace period', () => {
        vi.useFakeTimers();
        const { controller } = make();
        controller.SetSurface(surface(300));
        controller.PointerMove(10, 10);
        expect(controller.Pointer.Description?.Announcement).toBe('A, 1');
        controller.PointerLeave('mouse');
        expect(controller.Pointer.Active).toEqual(point);
        vi.advanceTimersByTime(PointerLeaveGraceMs + 1);
        expect(controller.Pointer.Active).toBeNull();
    });

    it('a pointer miss keeps the point for the grace period, then clears it; a hit cancels the pending clear', () => {
        vi.useFakeTimers();
        const { controller } = make();
        controller.SetSurface(surface(300));
        controller.PointerMove(10, 10);
        controller.PointerMove(80, 10); // HitTest misses at x >= 50
        expect(controller.Pointer.Active).toEqual(point);
        expect(controller.Pointer.TooltipOpen).toBe(true);
        vi.advanceTimersByTime(PointerLeaveGraceMs - 1);
        expect(controller.Pointer.Active).toEqual(point);
        vi.advanceTimersByTime(2);
        expect(controller.Pointer.Active).toBeNull();

        controller.PointerMove(10, 10);
        controller.PointerMove(80, 10);
        vi.advanceTimersByTime(PointerLeaveGraceMs - 1);
        controller.PointerMove(10, 10); // back on the plot: the pending clear is cancelled
        vi.advanceTimersByTime(PointerLeaveGraceMs * 3);
        expect(controller.Pointer.Active).toEqual(point);
    });

    it('repeated misses do not re-debounce the leave: it fires one grace period after the FIRST miss', () => {
        vi.useFakeTimers();
        const { controller } = make();
        controller.SetSurface(surface(300));
        controller.PointerMove(10, 10);
        controller.PointerMove(80, 10); // first miss at t=0
        vi.advanceTimersByTime(50);
        controller.PointerMove(81, 10); // t=50
        vi.advanceTimersByTime(50);
        controller.PointerMove(82, 10); // t=100
        expect(controller.Pointer.Active).toEqual(point);
        vi.advanceTimersByTime(PointerLeaveGraceMs - 100 + 1); // t = grace + 1 after the first miss
        expect(controller.Pointer.Active).toBeNull();
    });

    it('a pointer miss with nothing active schedules nothing', () => {
        vi.useFakeTimers();
        const { controller, render } = make();
        controller.SetSurface(surface(300));
        render.mockClear();
        controller.PointerMove(80, 10);
        vi.advanceTimersByTime(PointerLeaveGraceMs * 3);
        expect(render).not.toHaveBeenCalled();
    });

    it('hovering the tooltip cancels the pending leave', () => {
        vi.useFakeTimers();
        const { controller } = make();
        controller.SetSurface(surface(300));
        controller.PointerMove(10, 10);
        controller.PointerLeave('mouse');
        controller.TooltipHover(true);
        vi.advanceTimersByTime(PointerLeaveGraceMs * 3);
        expect(controller.Pointer.Active).toEqual(point);
    });

    it('arrow key selects a point; Activate returns it; Escape hides the tooltip only', () => {
        const { controller } = make();
        controller.SetSurface(surface(300));
        expect(controller.Key('ArrowRight')).toBeNull();
        expect(controller.Pointer.KeyboardActive).toBe(true);
        expect(controller.Key('Activate')).toEqual(point);
        controller.Key('Escape');
        expect(controller.Pointer.TooltipOpen).toBe(false);
        expect(controller.Pointer.Active).toEqual(point);
    });

    it('click returns the hit point for mouse; touch needs two taps', () => {
        const { controller } = make();
        controller.SetSurface(surface(300));
        expect(controller.Click(10, 10)).toEqual(point);
        expect(controller.PointerUp(10, 10, 'touch')).toBeNull();
        expect(controller.PointerUp(10, 10, 'touch')).toEqual(point);
        expect(controller.Click(10, 10)).toBeNull();
    });

    it('touch: pointerleave after pointerup does not break the two-tap emit', () => {
        vi.useFakeTimers();
        const { controller } = make();
        controller.SetSurface(surface(300));
        expect(controller.PointerUp(10, 10, 'touch')).toBeNull();
        controller.PointerLeave('touch');
        vi.advanceTimersByTime(PointerLeaveGraceMs * 3);
        expect(controller.PointerUp(10, 10, 'touch')).toEqual(point);
    });

    it('a tooltip hover flag does not stick after the tooltip closes without a pointerleave', () => {
        vi.useFakeTimers();
        const { controller } = make();
        controller.SetSurface(surface(300));
        controller.PointerMove(10, 10);
        controller.TooltipHover(true);
        controller.Key('Escape');
        controller.PointerLeave('mouse');
        vi.advanceTimersByTime(PointerLeaveGraceMs + 1);
        expect(controller.Pointer.Active).toBeNull();
    });

    it('touch: tapping empty space dismisses the armed point', () => {
        const { controller } = make();
        controller.SetSurface(surface(300));
        expect(controller.PointerUp(10, 10, 'touch')).toBeNull();
        expect(controller.Pointer.Active).toEqual(point);
        expect(controller.PointerUp(200, 10, 'touch')).toBeNull();
        expect(controller.Pointer.Active).toBeNull();
        expect(controller.Pointer.TooltipOpen).toBe(false);
    });

    it('a tooltip hover flag does not stick when a data change removes the active point', () => {
        vi.useFakeTimers();
        let points: ActivePoint[] = [point];
        const { controller } = make(undefined, () => points);
        controller.SetSurface(surface(300));
        controller.PointerMove(10, 10);
        controller.TooltipHover(true);
        points = [];
        controller.MarkDirty();
        void controller.View;
        points = [point];
        controller.MarkDirty();
        controller.PointerMove(10, 10);
        controller.PointerLeave('mouse');
        vi.advanceTimersByTime(PointerLeaveGraceMs + 1);
        expect(controller.Pointer.Active).toBeNull();
    });

    it('after Destroy, tooltip hover and pointer leave schedule nothing', () => {
        vi.useFakeTimers();
        const { controller, render } = make();
        controller.SetSurface(surface(300));
        controller.PointerMove(10, 10);
        controller.Destroy();
        render.mockClear();
        controller.TooltipHover(false);
        controller.PointerLeave('mouse');
        vi.advanceTimersByTime(PointerLeaveGraceMs * 3);
        expect(render).not.toHaveBeenCalled();
    });

    it('clears the active point and description when a data change removes it', () => {
        let points: ActivePoint[] = [point];
        const { controller } = make(undefined, () => points);
        controller.SetSurface(surface(300));
        controller.PointerMove(10, 10);
        expect(controller.Pointer.Active).toEqual(point);
        points = [];
        controller.MarkDirty();
        expect(controller.Pointer.Active).toBeNull();
        expect(controller.Pointer.Description).toBeNull();
    });

    it('Destroy cancels a pending leave timer', () => {
        vi.useFakeTimers();
        const { controller, render } = make();
        controller.SetSurface(surface(300));
        controller.PointerMove(10, 10);
        controller.PointerLeave('mouse');
        render.mockClear();
        controller.Destroy();
        vi.advanceTimersByTime(PointerLeaveGraceMs * 3);
        expect(render).not.toHaveBeenCalled();
    });
});
