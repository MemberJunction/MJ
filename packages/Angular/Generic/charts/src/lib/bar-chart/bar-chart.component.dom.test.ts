import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { LogError } from '@memberjunction/core';
import { OverlayQuery, ClearOverlayContainers, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import { MJBarChartComponent } from './bar-chart.component';
import { MJChartFrameComponent } from '../internal/chart-frame.component';
import { ChartPointEvent, ChartSeries } from '../chart.types';
import { ChartSvg, CreateTouchEvent, RenderChart, Settle } from '../internal/testing/chart-test-utils';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn() };
});

const series: ChartSeries[] = [{ Name: 'Healthy', Values: [3, 2] }, { Name: 'Critical', Values: [1, 4], Color: 'var(--mj-status-error)' }];

const defaults = { Categories: ['Model A', 'Model B'], Series: series, AriaLabel: 'Score bands' };
const render = (inputs: Record<string, unknown> = {}): Promise<ComponentFixture<MJBarChartComponent>> => RenderChart(MJBarChartComponent, defaults, inputs);
const marks = (f: ComponentFixture<unknown>): SVGPathElement[] => Array.from(f.nativeElement.querySelectorAll('path.mj-chart-mark'));
const svg = ChartSvg;
const centerOf = (f: ComponentFixture<MJBarChartComponent>, key: string): { x: number; y: number } => {
    const seg = f.componentInstance.Controller.View.Geometry!.Segments.find((s) => s.Key === key)!;
    return { x: seg.X + seg.Width / 2, y: seg.Y + seg.Height / 2 };
};

beforeEach(() => vi.mocked(LogError).mockClear());
afterEach(() => ClearOverlayContainers());

describe('MJBarChartComponent', () => {
    it('draws one mark per finite non-zero cell with token fills', async () => {
        const f = await render({ Stacked: true });
        expect(marks(f)).toHaveLength(4);
        const fills = marks(f).map((m) => m.style.fill);
        expect(fills.filter((x) => /^var\(--mj-viz-\d+\)$/.test(x))).toHaveLength(2);
        expect(fills.filter((x) => x === 'var(--mj-status-error)')).toHaveLength(2);
    });

    it('logs a non-token Color once and falls back to the viz token', async () => {
        const f = await render({ Series: [{ Name: 'A', Values: [1, 2], Color: '#16a34a' }] });
        expect(marks(f).every((m) => m.style.fill === 'var(--mj-viz-1)')).toBe(true);
        f.componentInstance.Controller.MarkDirty();
        await Settle(f);
        expect(vi.mocked(LogError).mock.calls.filter((c) => String(c[0]).includes('#16a34a'))).toHaveLength(1);
    });

    it('replacing Categories and Series together logs nothing', async () => {
        const f = await render();
        f.componentRef.setInput('Categories', ['A', 'B', 'C']);
        f.componentRef.setInput('Series', [{ Name: 'X', Values: [1, 2, 3] }]);
        await Settle(f);
        expect(LogError).not.toHaveBeenCalled();
        expect(marks(f)).toHaveLength(3);
    });

    it('shows the invalid state and logs once for mismatched lengths', async () => {
        const f = await render({ Series: [{ Name: 'X', Values: [1] }] });
        expect(f.nativeElement.querySelector('.mj-chart-state-invalid')).not.toBeNull();
        await Settle(f);
        expect(vi.mocked(LogError).mock.calls.filter((c) => String(c[0]).includes('length-mismatch'))).toHaveLength(1);
    });

    it('an unset (undefined) Orientation and Stacked render vertical and grouped', async () => {
        const f = await render({ Orientation: undefined, Stacked: undefined });
        expect(f.componentInstance.Orientation).toBe('vertical');
        expect(f.componentInstance.Stacked).toBe(false);
        expect(f.componentInstance.Controller.View.Geometry?.Orientation).toBe('vertical');
        expect(marks(f)).toHaveLength(4);
    });

    it('all-zero data draws axes and a baseline, not the empty state', async () => {
        const f = await render({ Series: [{ Name: 'X', Values: [0, 0] }] });
        expect(f.nativeElement.querySelector('.mj-chart-state')).toBeNull();
        expect(f.nativeElement.querySelectorAll('line.mj-chart-grid').length).toBeGreaterThan(0);
    });

    it('a theme toggle does not recompute the view', async () => {
        const f = await render();
        const before = f.componentInstance.Controller.View;
        try {
            document.documentElement.setAttribute('data-theme', 'dark');
            await Settle(f);
            expect(f.componentInstance.Controller.View).toBe(before);
        } finally {
            document.documentElement.removeAttribute('data-theme');
        }
    });

    it('mouse click emits the raw value for the hit segment', async () => {
        const f = await render({ Stacked: true });
        const events: ChartPointEvent[] = [];
        f.componentInstance.SegmentClick.subscribe((e) => events.push(e));
        const p = centerOf(f, '1:1');
        svg(f).dispatchEvent(new MouseEvent('click', { clientX: p.x, clientY: p.y, bubbles: true }));
        expect(events).toEqual([{ CategoryIndex: 1, Category: 'Model B', SeriesIndex: 1, SeriesName: 'Critical', Value: 4, Percent: null }]);
    });

    it('touch: first tap shows the tooltip, second tap emits, the synthetic click does not', async () => {
        const f = await render({ Stacked: true });
        const events: ChartPointEvent[] = [];
        f.componentInstance.SegmentClick.subscribe((e) => events.push(e));
        const p = centerOf(f, '0:0');
        const tap = (): void => {
            svg(f).dispatchEvent(CreateTouchEvent('pointerup', p.x, p.y));
            svg(f).dispatchEvent(new MouseEvent('click', { clientX: p.x, clientY: p.y, bubbles: true }));
        };
        tap();
        await Settle(f);
        expect(events).toHaveLength(0);
        expect(OverlayQuery('.mj-chart-tooltip')).not.toBeNull();
        tap();
        expect(events).toHaveLength(1);
    });

    it('touch: a pointerleave after the first tap does not discard the armed point', async () => {
        const f = await render({ Stacked: true });
        const events: ChartPointEvent[] = [];
        f.componentInstance.SegmentClick.subscribe((e) => events.push(e));
        const p = centerOf(f, '0:0');
        const tap = (): void => {
            svg(f).dispatchEvent(CreateTouchEvent('pointerup', p.x, p.y));
            svg(f).dispatchEvent(new MouseEvent('click', { clientX: p.x, clientY: p.y, bubbles: true }));
        };
        tap();
        svg(f).dispatchEvent(CreateTouchEvent('pointerleave', 0, 0));
        await new Promise((r) => setTimeout(r, 200));
        await Settle(f);
        tap();
        expect(events).toHaveLength(1);
    });

    it('touch: a touch pointermove over empty space keeps the tooltip and the armed point', async () => {
        const f = await render({ Stacked: true });
        const events: ChartPointEvent[] = [];
        f.componentInstance.SegmentClick.subscribe((e) => events.push(e));
        const p = centerOf(f, '0:0');
        const touch = (type: string, x: number, y: number): void => { svg(f).dispatchEvent(CreateTouchEvent(type, x, y)); };
        touch('pointerup', p.x, p.y);
        await Settle(f);
        expect(OverlayQuery('.mj-chart-tooltip')).not.toBeNull();
        touch('pointermove', 1, 1);
        await Settle(f);
        expect(OverlayQuery('.mj-chart-tooltip')).not.toBeNull();
        touch('pointerup', p.x, p.y);
        expect(events).toHaveLength(1);
    });

    it('hover opens a tooltip listing every series at the category', async () => {
        const f = await render({ Stacked: true });
        const p = centerOf(f, '0:1');
        svg(f).dispatchEvent(new MouseEvent('pointermove', { clientX: p.x, clientY: p.y, bubbles: true }));
        await Settle(f);
        const tip = OverlayQuery('.mj-chart-tooltip');
        expect(tip?.textContent).toContain('Model B');
        expect(tip?.textContent).toContain('Healthy');
        expect(tip?.textContent).toContain('Critical');
    });

    it('the tooltip anchor is per category: hovering any segment of a stack gives the same anchor, at the top of the stack', async () => {
        const f = await render({ Stacked: true });
        const controller = f.componentInstance.Controller;
        const anchorWhenHovering = async (key: string): Promise<{ X: number; Y: number }> => {
            const p = centerOf(f, key);
            svg(f).dispatchEvent(new MouseEvent('pointermove', { clientX: p.x, clientY: p.y, bubbles: true }));
            await Settle(f);
            return controller.Pointer.Description!.Anchor;
        };
        // Keys are `${series}:${category}`: 0:1 and 1:1 are the two segments of the second stack.
        const lowerSegment = await anchorWhenHovering('0:1');
        const upperSegment = await anchorWhenHovering('1:1');
        expect(upperSegment).toEqual(lowerSegment);
        const stack = controller.View.Geometry!.Segments.filter((s) => s.CategoryIndex === 1);
        expect(upperSegment.Y).toBe(Math.min(...stack.map((s) => s.Y)));
        expect((await anchorWhenHovering('0:0')).X).toBeLessThan(upperSegment.X);
    });

    it('keyboard: arrows move and announce, Enter emits, Escape closes the tooltip', async () => {
        const f = await render({ Stacked: true });
        const events: ChartPointEvent[] = [];
        f.componentInstance.SegmentClick.subscribe((e) => events.push(e));
        const group = f.nativeElement.querySelector('.mj-chart') as HTMLElement;
        const key = (k: string): void => { group.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); };
        group.dispatchEvent(new FocusEvent('focus'));
        key('ArrowRight');
        await Settle(f);
        expect(f.nativeElement.querySelector('[aria-live="polite"]')?.textContent).toContain('Model A, Healthy');
        expect(f.nativeElement.querySelector('rect.mj-chart-focus')).not.toBeNull();
        key('ArrowRight');
        key('Enter');
        expect(events[0].Category).toBe('Model B');
        await Settle(f);
        expect(OverlayQuery('.mj-chart-tooltip')).not.toBeNull();
        key('Escape');
        await Settle(f);
        expect(OverlayQuery('.mj-chart-tooltip')).toBeNull();
    });

    it('clamps a too-small Height and logs once', async () => {
        const f = await render({ Height: 10 });
        expect((f.nativeElement.querySelector('.mj-chart') as HTMLElement).style.height).toBe('120px');
        expect(vi.mocked(LogError).mock.calls.filter((c) => String(c[0]).includes('Height'))).toHaveLength(1);
    });

    it('an unset (undefined) Height falls back to the default silently', async () => {
        const f = await render({ Height: undefined });
        expect((f.nativeElement.querySelector('.mj-chart') as HTMLElement).style.height).toBe('300px');
        expect(vi.mocked(LogError).mock.calls.filter((c) => String(c[0]).includes('Height'))).toHaveLength(0);
    });

    it('horizontal stacked: categories run top to bottom, segments grow rightward', async () => {
        const f = await render({ Orientation: 'horizontal', Stacked: true });
        expect(marks(f)).toHaveLength(4);
        const labels = Array.from(f.nativeElement.querySelectorAll('text.mj-chart-axis-label')) as SVGTextElement[];
        const yOf = (name: string): number => Number(labels.find((l) => l.textContent?.trim() === name)!.getAttribute('y'));
        expect(yOf('Model A')).toBeLessThan(yOf('Model B'));
        const g = f.componentInstance.Controller.View.Geometry!;
        for (const seg of g.Segments) {
            expect(seg.X).toBeGreaterThanOrEqual(g.Box.X);
            expect(seg.Width).toBeGreaterThan(0);
        }
        for (const m of marks(f)) {
            const startX = Number(/^M\s*(-?[\d.]+)/.exec(m.getAttribute('d') ?? '')![1]);
            expect(startX).toBeGreaterThanOrEqual(g.Box.X);
        }
    });

    it("a horizontal chart asks its frame to place the tooltip to the right (it must not cover the row above); a vertical one keeps 'above'", async () => {
        const placement = (f: ComponentFixture<unknown>): string => (f.debugElement.query((d) => d.componentInstance instanceof MJChartFrameComponent).componentInstance as MJChartFrameComponent).TooltipPlacement;
        expect(placement(await render({ Orientation: 'horizontal' }))).toBe('right');
        expect(placement(await render({ Orientation: 'vertical' }))).toBe('above');
    });

    it.each(['vertical', 'horizontal'] as const)('%s: every axis label renders with the text-anchor its tick reports', async (orientation) => {
        const f = await render({ Orientation: orientation });
        const g = f.componentInstance.Controller.View.Geometry!;
        const labels = Array.from(f.nativeElement.querySelectorAll('text.mj-chart-axis-label')) as SVGTextElement[];
        const expected = [...g.ValueAxis, ...g.CategoryAxis].map((t) => `${t.Label}|${t.Anchor}`).sort();
        const actual = labels.map((l) => `${l.textContent?.trim()}|${l.getAttribute('text-anchor')}`).sort();
        expect(actual).toEqual(expected);
    });

    it('logs a missing AriaLabel once', async () => {
        await render({ AriaLabel: '' });
        expect(vi.mocked(LogError).mock.calls.filter((c) => String(c[0]).includes('AriaLabel'))).toHaveLength(1);
    });

    it('has no axe violations', async () => {
        const f = await render();
        await ExpectNoAxeViolations(f);
    });

    it("Height='fill' reaches the frame and marks the chart host", async () => {
        const f = await render({ Height: 'fill' });
        expect(f.nativeElement.querySelector('mj-chart-frame')?.classList.contains('mj-chart-frame-fill')).toBe(true);
        expect((f.nativeElement as HTMLElement).classList.contains('mj-chart-fill')).toBe(true);
    });

    it('a numeric Height leaves the chart host unmarked', async () => {
        const f = await render({ Height: 250 });
        expect((f.nativeElement as HTMLElement).classList.contains('mj-chart-fill')).toBe(false);
    });

    it('AspectRatio sizes the chart from its width', async () => {
        const f = await render({ AspectRatio: 2 });
        expect((f.nativeElement.querySelector('.mj-chart') as HTMLElement).style.height).toBe('300px');
    });

    it('an invalid AspectRatio is logged once and ignored', async () => {
        const f = await render({ AspectRatio: -1, Height: 250 });
        expect((f.nativeElement.querySelector('.mj-chart') as HTMLElement).style.height).toBe('250px');
        f.componentRef.setInput('AspectRatio', -1);
        f.componentRef.setInput('AspectRatio', Number.NaN);
        await Settle(f);
        expect((f.nativeElement.querySelector('.mj-chart') as HTMLElement).style.height).toBe('250px');
        expect(vi.mocked(LogError).mock.calls.filter((c) => String(c[0]).includes('AspectRatio'))).toHaveLength(1);
    });

    it('an out-of-range AspectRatio is clamped to [0.25, 8] and logged once', async () => {
        const f = await render({ AspectRatio: 100 });
        expect(f.componentInstance.AspectRatio).toBe(8);
        f.componentRef.setInput('AspectRatio', 100);
        await Settle(f);
        expect(vi.mocked(LogError).mock.calls.filter((c) => String(c[0]).includes('AspectRatio'))).toHaveLength(1);
        f.componentRef.setInput('AspectRatio', 0.01);
        expect(f.componentInstance.AspectRatio).toBe(0.25);
    });

    it('a null or undefined AspectRatio and Height are silently unset', async () => {
        const f = await render({ AspectRatio: null, Height: undefined });
        expect(f.componentInstance.AspectRatio).toBeNull();
        expect(f.componentInstance.Height).toBe(300);
        expect((f.nativeElement.querySelector('.mj-chart') as HTMLElement).style.height).toBe('300px');
        expect(LogError).not.toHaveBeenCalled();
    });

    it('changing AspectRatio at runtime re-lays out without a resize', async () => {
        const f = await render({ AspectRatio: 2 });
        const g = f.componentInstance.Controller.View.Geometry!;
        f.componentRef.setInput('AspectRatio', 1);
        await Settle(f);
        expect(f.componentInstance.Controller.View.Geometry!.Size.Height).toBeGreaterThan(g.Size.Height);
    });

    it('ShowGridlines=false removes gridlines but keeps axis labels', async () => {
        const f = await render({ ShowGridlines: false });
        expect(f.nativeElement.querySelectorAll('line.mj-chart-grid').length).toBe(0);
        expect(f.nativeElement.querySelectorAll('text.mj-chart-axis-label').length).toBeGreaterThan(0);
    });

    it('toggling ShowGridlines at runtime re-renders without a resize', async () => {
        const f = await render();
        expect(f.nativeElement.querySelectorAll('line.mj-chart-grid').length).toBeGreaterThan(0);
        f.componentRef.setInput('ShowGridlines', false);
        await Settle(f);
        expect(f.nativeElement.querySelectorAll('line.mj-chart-grid').length).toBe(0);
        f.componentRef.setInput('ShowGridlines', true);
        await Settle(f);
        expect(f.nativeElement.querySelectorAll('line.mj-chart-grid').length).toBeGreaterThan(0);
    });

    it('a null or undefined ShowGridlines draws the gridlines', async () => {
        const f = await render({ ShowGridlines: null });
        expect(f.componentInstance.ShowGridlines).toBe(true);
        expect(f.nativeElement.querySelectorAll('line.mj-chart-grid').length).toBeGreaterThan(0);
    });

    it('axis label offsets follow the font metrics, not literals', async () => {
        const f = await render();
        const g = f.componentInstance.Controller.View.Geometry!;
        const label = f.nativeElement.querySelector('text.mj-chart-axis-label[text-anchor="middle"]') as SVGTextElement;
        expect(Number(label.getAttribute('y'))).toBe(g.Box.Y + g.Box.Height + g.Type.LineHeight);
    });

    it('horizontal axis labels sit AxisGap left of the plot and LineHeight below it', async () => {
        const f = await render({ Orientation: 'horizontal' });
        const g = f.componentInstance.Controller.View.Geometry!;
        const labels = Array.from(f.nativeElement.querySelectorAll('text.mj-chart-axis-label')) as SVGTextElement[];
        const category = labels.find((l) => l.getAttribute('dominant-baseline') === 'middle')!;
        const value = labels.find((l) => l.getAttribute('dominant-baseline') !== 'middle')!;
        expect(Number(category.getAttribute('x'))).toBe(g.Box.X - g.Type.AxisGap);
        expect(Number(value.getAttribute('y'))).toBe(g.Box.Y + g.Box.Height + g.Type.LineHeight);
    });

    it('scales axis offsets with a host font-size of 18px', async () => {
        const realComputedStyle = window.getComputedStyle.bind(window);
        vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) =>
            el.classList.contains('mj-chart') ? ({ fontSize: '18px', fontFamily: 'Inter' } as CSSStyleDeclaration) : realComputedStyle(el, pseudo));
        try {
            const f = await render();
            const g = f.componentInstance.Controller.View.Geometry!;
            expect(g.Type.FontSize).toBe(18);
            const label = f.nativeElement.querySelector('text.mj-chart-axis-label[text-anchor="middle"]') as SVGTextElement;
            expect(Number(label.getAttribute('y'))).toBe(g.Box.Y + g.Box.Height + 24);
        } finally {
            vi.restoreAllMocks();
        }
    });
});
