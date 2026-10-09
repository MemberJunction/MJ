import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { LogError } from '@memberjunction/core';
import { OverlayQuery, ClearOverlayContainers, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import { MJDonutChartComponent } from './donut-chart.component';
import { ChartSliceEvent } from '../chart.types';
import { ChartSvg, CreateTouchEvent, RenderChart, Settle } from '../internal/testing/chart-test-utils';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn() };
});

const defaults = {
    Slices: [{ Label: 'Healthy', Value: 30, Color: 'var(--mj-status-success)' }, { Label: 'Critical', Value: 10, Color: 'var(--mj-status-error)' }],
    AriaLabel: 'Band distribution',
};
const render = (inputs: Record<string, unknown> = {}): Promise<ComponentFixture<MJDonutChartComponent>> => RenderChart(MJDonutChartComponent, defaults, inputs);
const arcs = (f: ComponentFixture<unknown>): SVGPathElement[] => Array.from(f.nativeElement.querySelectorAll('path.mj-chart-mark'));
const logged = (needle: string): number => vi.mocked(LogError).mock.calls.filter((c) => String(c[0]).includes(needle)).length;
/** A point on the ring inside slice 0 (Healthy, 75% of the ring, so its mid-angle is 135 degrees clockwise from 12 o'clock). */
const insideHealthy = (f: ComponentFixture<MJDonutChartComponent>): { x: number; y: number } => {
    const g = f.componentInstance.Controller.View.Geometry!;
    const mid = (g.Arcs[0].StartAngle + g.Arcs[0].EndAngle) / 2;
    const r = (g.InnerRadius + g.OuterRadius) / 2;
    return { x: g.CenterX + Math.sin(mid) * r, y: g.CenterY - Math.cos(mid) * r };
};

/** How far the drawn center label sits above, and the center value below, the donut's center. */
const centerOffsets = (f: ComponentFixture<MJDonutChartComponent>): { Label: number; Value: number } => {
    const g = f.componentInstance.Controller.View.Geometry!;
    const y = (selector: string): number => Number((f.nativeElement.querySelector(selector) as SVGTextElement).getAttribute('y'));
    return { Label: g.CenterY - y('text.mj-chart-center-label'), Value: y('text.mj-chart-center-value') - g.CenterY };
};

beforeEach(() => vi.mocked(LogError).mockClear());
afterEach(() => ClearOverlayContainers());

describe('MJDonutChartComponent', () => {
    it('draws one arc per positive slice with the given token fills', async () => {
        const f = await render();
        expect(arcs(f).map((a) => a.style.fill)).toEqual(['var(--mj-status-success)', 'var(--mj-status-error)']);
    });

    it('renders the center label and value', async () => {
        const f = await render({ CenterLabel: 'Scored', CenterValue: '40' });
        expect(f.nativeElement.querySelector('text.mj-chart-center-label')?.textContent).toContain('Scored');
        expect(f.nativeElement.querySelector('text.mj-chart-center-value')?.textContent).toContain('40');
    });

    it('draws percent labels outside the ring when asked', async () => {
        const f = await render({ ShowPercentLabels: true });
        expect(f.nativeElement.querySelectorAll('text.mj-chart-percent-label').length).toBe(2);
    });

    it('an unset (undefined) ShowPercentLabels draws no percent labels', async () => {
        const f = await render({ ShowPercentLabels: undefined });
        expect(f.nativeElement.querySelectorAll('text.mj-chart-percent-label').length).toBe(0);
    });

    it('excludes and logs a negative slice once, keeping indexes', async () => {
        const f = await render({ Slices: [{ Label: 'a', Value: 2 }, { Label: 'b', Value: -1 }, { Label: 'c', Value: 2 }] });
        expect(arcs(f)).toHaveLength(2);
        expect(logged('"b"')).toBe(1);
        const events: ChartSliceEvent[] = [];
        f.componentInstance.SliceClick.subscribe((e) => events.push(e));
        const group = f.nativeElement.querySelector('.mj-chart') as HTMLElement;
        group.dispatchEvent(new FocusEvent('focus'));
        group.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        group.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(events[0]).toEqual({ SliceIndex: 2, Label: 'c', Value: 2, Percent: 50 });
    });

    it('a zero total shows the empty state', async () => {
        const f = await render({ Slices: [{ Label: 'a', Value: 0 }], EmptyMessage: 'No scores' });
        expect(f.nativeElement.querySelector('.mj-chart-state')?.textContent).toContain('No scores');
    });

    it('clamps InnerRadiusRatio above 0.85 and logs once', async () => {
        const f = await render({ InnerRadiusRatio: 1 });
        const g = f.componentInstance.Controller.View.Geometry!;
        expect(g.InnerRadius / g.OuterRadius).toBeCloseTo(0.85, 2);
        expect(logged('InnerRadiusRatio')).toBe(1);
    });

    it('an unset (undefined) InnerRadiusRatio or Height uses the defaults with no log', async () => {
        const f = await render({ InnerRadiusRatio: undefined, Height: undefined });
        const g = f.componentInstance.Controller.View.Geometry!;
        expect(g.InnerRadius / g.OuterRadius).toBeCloseTo(0.7, 2);
        expect(f.componentInstance.InnerRadiusRatio).toBe(0.7);
        expect((f.nativeElement.querySelector('.mj-chart') as HTMLElement).style.height).toBe('300px');
        expect(logged('InnerRadiusRatio') + logged('Height')).toBe(0);
    });

    it('clamps a too-small Height and logs once', async () => {
        const f = await render({ Height: 10 });
        expect((f.nativeElement.querySelector('.mj-chart') as HTMLElement).style.height).toBe('120px');
        expect(logged('Height')).toBe(1);
    });

    it('hover opens a tooltip with the slice label and percent', async () => {
        const f = await render();
        const p = insideHealthy(f);
        ChartSvg(f).dispatchEvent(new MouseEvent('pointermove', { clientX: p.x, clientY: p.y, bubbles: true }));
        await Settle(f);
        const tip = OverlayQuery('.mj-chart-tooltip');
        expect(tip?.textContent).toContain('Healthy');
        expect(tip?.textContent).toContain('75');
    });

    it('click emits the slice with raw value and percent', async () => {
        const f = await render();
        const events: ChartSliceEvent[] = [];
        f.componentInstance.SliceClick.subscribe((e) => events.push(e));
        const p = insideHealthy(f);
        ChartSvg(f).dispatchEvent(new MouseEvent('click', { clientX: p.x, clientY: p.y, bubbles: true }));
        expect(events).toEqual([{ SliceIndex: 0, Label: 'Healthy', Value: 30, Percent: 75 }]);
    });

    it('touch: first tap shows the tooltip, second tap emits once even with a touch pointerleave between', async () => {
        const f = await render();
        const events: ChartSliceEvent[] = [];
        f.componentInstance.SliceClick.subscribe((e) => events.push(e));
        const p = insideHealthy(f);
        const tap = (): void => {
            ChartSvg(f).dispatchEvent(CreateTouchEvent('pointerup', p.x, p.y));
            // The browser's synthetic click after a touch pointerup must not double-emit.
            ChartSvg(f).dispatchEvent(new MouseEvent('click', { clientX: p.x, clientY: p.y, bubbles: true }));
        };
        tap();
        await Settle(f);
        expect(events).toHaveLength(0);
        expect(OverlayQuery('.mj-chart-tooltip')).not.toBeNull();
        ChartSvg(f).dispatchEvent(CreateTouchEvent('pointerleave', p.x, p.y));
        await new Promise((r) => setTimeout(r, 200));
        await Settle(f);
        tap();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ Label: 'Healthy', Value: 30 });
    });

    it('touch: a touch pointermove over empty space keeps the tooltip and the armed slice', async () => {
        const f = await render();
        const events: ChartSliceEvent[] = [];
        f.componentInstance.SliceClick.subscribe((e) => events.push(e));
        const p = insideHealthy(f);
        ChartSvg(f).dispatchEvent(CreateTouchEvent('pointerup', p.x, p.y));
        await Settle(f);
        expect(OverlayQuery('.mj-chart-tooltip')).not.toBeNull();
        ChartSvg(f).dispatchEvent(CreateTouchEvent('pointermove', 1, 1));
        await Settle(f);
        expect(OverlayQuery('.mj-chart-tooltip')).not.toBeNull();
        ChartSvg(f).dispatchEvent(CreateTouchEvent('pointerup', p.x, p.y));
        expect(events).toHaveLength(1);
    });

    it('keyboard focus draws a focus arc and announces the slice', async () => {
        const f = await render();
        const group = f.nativeElement.querySelector('.mj-chart') as HTMLElement;
        group.dispatchEvent(new FocusEvent('focus'));
        group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await Settle(f);
        expect(f.nativeElement.querySelector('path.mj-chart-focus')).not.toBeNull();
        expect(f.nativeElement.querySelector('[aria-live="polite"]')?.textContent).toContain('Healthy');
    });

    it('keyboard: Enter emits, the tooltip is open, Escape closes it', async () => {
        const f = await render();
        const events: ChartSliceEvent[] = [];
        f.componentInstance.SliceClick.subscribe((e) => events.push(e));
        const group = f.nativeElement.querySelector('.mj-chart') as HTMLElement;
        const key = (k: string): void => { group.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); };
        group.dispatchEvent(new FocusEvent('focus'));
        key('ArrowRight');
        key('Enter');
        expect(events[0]).toMatchObject({ Label: 'Healthy', Value: 30 });
        await Settle(f);
        expect(OverlayQuery('.mj-chart-tooltip')).not.toBeNull();
        key('Escape');
        await Settle(f);
        expect(OverlayQuery('.mj-chart-tooltip')).toBeNull();
    });

    it('hover: the tooltip is open before Escape closes it', async () => {
        const f = await render();
        const p = insideHealthy(f);
        ChartSvg(f).dispatchEvent(new MouseEvent('pointermove', { clientX: p.x, clientY: p.y, bubbles: true }));
        await Settle(f);
        expect(OverlayQuery('.mj-chart-tooltip')).not.toBeNull();
        const group = f.nativeElement.querySelector('.mj-chart') as HTMLElement;
        group.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await Settle(f);
        expect(OverlayQuery('.mj-chart-tooltip')).toBeNull();
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

    it('center label and value offsets follow the font metrics (12 and 10 at 12px)', async () => {
        const f = await render({ CenterLabel: 'Scored', CenterValue: '40' });
        expect(centerOffsets(f)).toEqual({ Label: 12, Value: 10 });
    });

    it('center offsets grow with the host font size', async () => {
        const realComputedStyle = window.getComputedStyle.bind(window);
        vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) =>
            el.classList.contains('mj-chart') ? ({ fontSize: '18px', fontFamily: 'Inter' } as CSSStyleDeclaration) : realComputedStyle(el, pseudo));
        try {
            const f = await render({ CenterLabel: 'Scored', CenterValue: '40' });
            expect(centerOffsets(f)).toEqual({ Label: 18, Value: 14 });
        } finally {
            vi.restoreAllMocks();
        }
    });

    it('a lone center label or value is drawn at the center', async () => {
        const f = await render({ CenterLabel: 'Scored' });
        const g = f.componentInstance.Controller.View.Geometry!;
        expect(Number((f.nativeElement.querySelector('text.mj-chart-center-label') as SVGTextElement).getAttribute('y'))).toBe(g.CenterY);
    });
});
