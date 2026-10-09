import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { LogError } from '@memberjunction/core';
import { OverlayQuery, ClearOverlayContainers, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import { MJAreaChartComponent } from './area-chart.component';
import { ChartPointEvent } from '../chart.types';
import { ChartSvg, CreateTouchEvent, RenderChart, Settle } from '../internal/testing/chart-test-utils';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn() };
});

const defaults = {
    Categories: ['Jan', 'Feb', 'Mar'],
    Series: [{ Name: 'Healthy', Values: [1, 2, 3] }, { Name: 'Critical', Values: [3, 2, 1] }],
    AriaLabel: 'Band mix history',
};
const render = (inputs: Record<string, unknown> = {}): Promise<ComponentFixture<MJAreaChartComponent>> => RenderChart(MJAreaChartComponent, defaults, inputs);
const areas = (f: ComponentFixture<unknown>): SVGPathElement[] => Array.from(f.nativeElement.querySelectorAll('path.mj-chart-mark'));
const svg = ChartSvg;
/** Mid-height of series 0's band at category 0 — a point the hit test resolves to Jan / Healthy. */
const janHealthy = (f: ComponentFixture<MJAreaChartComponent>): { x: number; y: number } => {
    const g = f.componentInstance.Controller.View.Geometry!;
    return { x: g.CategoryX[0], y: ((g.Layers[0].Y0[0] ?? 0) + (g.Layers[0].Y1[0] ?? 0)) / 2 };
};
beforeEach(() => vi.mocked(LogError).mockClear());
afterEach(() => ClearOverlayContainers());

describe('MJAreaChartComponent', () => {
    it('draws exactly one fill path per series (no per-point nodes)', async () => {
        const f = await render();
        expect(areas(f)).toHaveLength(2);
        expect(f.nativeElement.querySelectorAll('circle').length).toBe(0);
    });

    it('applies the default FillOpacity of 0.85', async () => {
        const f = await render();
        expect(areas(f)[0].getAttribute('fill-opacity')).toBe('0.85');
    });

    it('applies FillOpacity and logs + clamps an out-of-range value', async () => {
        const f = await render({ FillOpacity: 2 });
        expect(areas(f)[0].getAttribute('fill-opacity')).toBe('1');
        expect(vi.mocked(LogError).mock.calls.filter((c) => String(c[0]).includes('FillOpacity'))).toHaveLength(1);
    });

    it('an unset (undefined) FillOpacity or Height falls back to the defaults silently', async () => {
        const f = await render({ FillOpacity: undefined, Height: undefined });
        expect(areas(f)[0].getAttribute('fill-opacity')).toBe('0.85');
        expect((f.nativeElement.querySelector('.mj-chart') as HTMLElement).style.height).toBe('300px');
        expect(vi.mocked(LogError).mock.calls.filter((c) => /FillOpacity|Height/.test(String(c[0])))).toHaveLength(0);
    });

    it('clamps a too-small Height and logs once', async () => {
        const f = await render({ Height: 10 });
        expect((f.nativeElement.querySelector('.mj-chart') as HTMLElement).style.height).toBe('120px');
        expect(vi.mocked(LogError).mock.calls.filter((c) => String(c[0]).includes('Height'))).toHaveLength(1);
    });

    it('percent mode labels the value axis in percent and emits raw value + share', async () => {
        const f = await render({ StackMode: 'percent' });
        const labels = Array.from(f.nativeElement.querySelectorAll('text.mj-chart-axis-label')).map((t) => (t as Element).textContent?.trim());
        expect(labels.some((l) => l?.includes('%'))).toBe(true);
        const events: ChartPointEvent[] = [];
        f.componentInstance.PointClick.subscribe((e) => events.push(e));
        const p = janHealthy(f);
        svg(f).dispatchEvent(new MouseEvent('click', { clientX: p.x, clientY: p.y, bubbles: true }));
        expect(events[0]).toEqual({ CategoryIndex: 0, Category: 'Jan', SeriesIndex: 0, SeriesName: 'Healthy', Value: 1, Percent: 25 });
    });

    it('unset (undefined) StackMode and Curve render as plain smooth areas', async () => {
        const f = await render({ StackMode: undefined, Curve: undefined, Series: [{ Name: 'A', Values: [1, -1, 2] }] });
        expect(f.componentInstance.StackMode).toBe('none');
        expect(f.componentInstance.Curve).toBe('smooth');
        expect(f.nativeElement.querySelector('.mj-chart-state-invalid')).toBeNull();
        expect(areas(f)).toHaveLength(1);
        expect(f.componentInstance.Controller.View.Status.Kind).toBe('ok');
        expect(f.componentInstance.Controller.View.Geometry?.Stacked).toBe(false);
    });

    it('negative values in percent mode are invalid and logged once', async () => {
        const f = await render({ StackMode: 'percent', Series: [{ Name: 'A', Values: [1, -1, 2] }] });
        expect(f.nativeElement.querySelector('.mj-chart-state-invalid')).not.toBeNull();
        expect(vi.mocked(LogError).mock.calls.filter((c) => String(c[0]).includes('negative-in-percent'))).toHaveLength(1);
    });

    it('touch: first tap shows the tooltip, second tap emits once even with a touch pointerleave between', async () => {
        const f = await render();
        const events: ChartPointEvent[] = [];
        f.componentInstance.PointClick.subscribe((e) => events.push(e));
        const p = janHealthy(f);
        const tap = (): void => {
            svg(f).dispatchEvent(CreateTouchEvent('pointerup', p.x, p.y));
            // The browser's synthetic click after a touch pointerup must not double-emit.
            svg(f).dispatchEvent(new MouseEvent('click', { clientX: p.x, clientY: p.y, bubbles: true }));
        };
        tap();
        await Settle(f);
        expect(events).toHaveLength(0);
        expect(OverlayQuery('.mj-chart-tooltip')).not.toBeNull();
        svg(f).dispatchEvent(CreateTouchEvent('pointerleave', p.x, p.y));
        await new Promise((r) => setTimeout(r, 200));
        await Settle(f);
        tap();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ Category: 'Jan', SeriesName: 'Healthy', Value: 1 });
    });

    it('touch: a touch pointermove over empty space keeps the tooltip and the armed point', async () => {
        const f = await render();
        const events: ChartPointEvent[] = [];
        f.componentInstance.PointClick.subscribe((e) => events.push(e));
        const p = janHealthy(f);
        svg(f).dispatchEvent(CreateTouchEvent('pointerup', p.x, p.y));
        await Settle(f);
        expect(OverlayQuery('.mj-chart-tooltip')).not.toBeNull();
        svg(f).dispatchEvent(CreateTouchEvent('pointermove', 1, 1));
        await Settle(f);
        expect(OverlayQuery('.mj-chart-tooltip')).not.toBeNull();
        svg(f).dispatchEvent(CreateTouchEvent('pointerup', p.x, p.y));
        expect(events).toHaveLength(1);
    });

    it('hover opens a tooltip listing every series at the category', async () => {
        const f = await render();
        const p = janHealthy(f);
        svg(f).dispatchEvent(new MouseEvent('pointermove', { clientX: p.x, clientY: p.y, bubbles: true }));
        await Settle(f);
        const tip = OverlayQuery('.mj-chart-tooltip');
        expect(tip?.textContent).toContain('Jan');
        expect(tip?.textContent).toContain('Healthy');
        expect(tip?.textContent).toContain('Critical');
    });

    it('the tooltip stays put and open while the pointer travels straight up from the lower layer to the anchor (WCAG 1.4.13)', async () => {
        const f = await render({ StackMode: 'percent' });
        const controller = f.componentInstance.Controller;
        const g = controller.View.Geometry!;
        const x = g.CategoryX[1];
        const lower = g.Layers[0];
        const startY = ((lower.Y0[1] ?? 0) + (lower.Y1[1] ?? 0)) / 2;
        const move = async (y: number): Promise<void> => {
            svg(f).dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
            await Settle(f);
        };
        await move(startY);
        expect(controller.Pointer.Active).toEqual({ CategoryIndex: 1, SeriesIndex: 0 });
        const anchor = controller.Pointer.Description!.Anchor;
        expect(anchor.Y).toBeLessThan(startY);
        expect(OverlayQuery('.mj-chart-tooltip')).not.toBeNull();

        const steps = 12;
        const crossed = new Set<number>();
        for (let i = 1; i <= steps; i++) {
            await move(startY + ((anchor.Y - startY) * i) / steps);
            crossed.add(controller.Pointer.Active!.SeriesIndex);
            expect(controller.Pointer.Description!.Anchor).toEqual(anchor);
            expect(controller.Pointer.Active).not.toBeNull();
        }
        // The path really did cross into the upper layer, and the tooltip did not move for it.
        expect(crossed).toEqual(new Set([0, 1]));

        // Leaving the plot altogether: the point survives the grace period.
        svg(f).dispatchEvent(new MouseEvent('pointermove', { clientX: g.Box.X + g.Box.Width + 40, clientY: anchor.Y, bubbles: true }));
        expect(controller.Pointer.Active).not.toBeNull();
        await new Promise((r) => setTimeout(r, 50));
        expect(controller.Pointer.Active).not.toBeNull();
        expect(controller.Pointer.Description!.Anchor).toEqual(anchor);
        expect(OverlayQuery('.mj-chart-tooltip')).not.toBeNull();
    });

    it('first and last category labels are anchored inward so they stay inside the SVG', async () => {
        const f = await render({ Categories: ['Week of Oct 10', 'Week of Oct 17', 'Week of Oct 24'] });
        const anchors = Array.from(f.nativeElement.querySelectorAll('text.mj-chart-axis-label'))
            .filter((t) => (t as Element).textContent?.includes('Week'))
            .map((t) => (t as Element).getAttribute('text-anchor'));
        expect(anchors).toEqual(['start', 'middle', 'end']);
    });

    it('keyboard focus draws a focus marker on the active point', async () => {
        const f = await render();
        const group = f.nativeElement.querySelector('.mj-chart') as HTMLElement;
        group.dispatchEvent(new FocusEvent('focus'));
        group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await Settle(f);
        expect(f.nativeElement.querySelector('circle.mj-chart-focus')).not.toBeNull();
        expect(f.nativeElement.querySelector('[aria-live="polite"]')?.textContent).toContain('Jan, Healthy');
    });

    it('keyboard: Enter emits, the tooltip is open, Escape closes it', async () => {
        const f = await render();
        const events: ChartPointEvent[] = [];
        f.componentInstance.PointClick.subscribe((e) => events.push(e));
        const group = f.nativeElement.querySelector('.mj-chart') as HTMLElement;
        const key = (k: string): void => { group.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); };
        group.dispatchEvent(new FocusEvent('focus'));
        key('ArrowRight');
        key('ArrowRight');
        key('Enter');
        expect(events[0]).toMatchObject({ Category: 'Feb', SeriesName: 'Healthy', Value: 2 });
        await Settle(f);
        expect(OverlayQuery('.mj-chart-tooltip')).not.toBeNull();
        key('Escape');
        await Settle(f);
        expect(OverlayQuery('.mj-chart-tooltip')).toBeNull();
    });

    it('every axis label renders with the text-anchor its tick reports', async () => {
        const f = await render();
        const g = f.componentInstance.Controller.View.Geometry!;
        const labels = Array.from(f.nativeElement.querySelectorAll('text.mj-chart-axis-label')) as SVGTextElement[];
        const expected = [...g.ValueAxis, ...g.CategoryAxis].map((t) => `${t.Label}|${t.Anchor}`).sort();
        const actual = labels.map((l) => `${l.textContent?.trim()}|${l.getAttribute('text-anchor')}`).sort();
        expect(actual).toEqual(expected);
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
        const category = f.nativeElement.querySelector('text.mj-chart-axis-label:not([dominant-baseline])') as SVGTextElement;
        const value = f.nativeElement.querySelector('text.mj-chart-axis-label[dominant-baseline="middle"]') as SVGTextElement;
        expect(Number(category.getAttribute('y'))).toBe(g.Box.Y + g.Box.Height + g.Type.LineHeight);
        expect(Number(value.getAttribute('x'))).toBe(g.Box.X - g.Type.AxisGap);
    });
});
