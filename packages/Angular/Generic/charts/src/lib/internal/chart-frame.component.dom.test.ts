import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OverlayQuery, ClearOverlayContainers } from '@memberjunction/ng-test-utils';
import { LogError } from '@memberjunction/core';
import { FallbackWidth, KeyToCommand, MJChartFrameComponent, ResolveOuterHeight } from './chart-frame.component';
import { ChartSurface, ChartTableModel, LegendItem } from './geometry.types';
import { TypeMetrics } from './scales';
import { CreateTextMeasure } from './text-measure';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn() };
});

vi.mock('./text-measure', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./text-measure')>();
    return { ...actual, CreateTextMeasure: vi.fn(actual.CreateTextMeasure) };
});

class FakeResizeObserver {
    public static Instances: FakeResizeObserver[] = [];
    public Disconnect = vi.fn();
    constructor(private readonly callback: ResizeObserverCallback) { FakeResizeObserver.Instances.push(this); }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void { this.Disconnect(); }
    Trigger(width: number, height = 0): void {
        this.callback([{ contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
}

const table: ChartTableModel = { Caption: 'Sales', ColumnHeaders: ['A'], Rows: [{ Header: 'Q1', Cells: ['1'], Key: 'r0' }], TruncatedNote: null };
const legend: LegendItem[] = [{ Label: 'A', Color: 'var(--mj-viz-1)', Key: 'a' }];
const settle = async (f: ComponentFixture<unknown>): Promise<void> => {
    f.detectChanges();
    await new Promise((r) => setTimeout(r, 40));
    await f.whenStable();
    f.detectChanges();
};

interface HostBox { Width: number; Height: number }

/**
 * Controls the host's layout size (offsetWidth / offsetHeight, which is what the frame reads) and
 * records the chart box's display at each height read. jsdom lays nothing out, so without a stub
 * the host measures 0 and the frame mounts hidden.
 */
class HostBoxStub {
    public readonly DisplayAtRead: string[] = [];
    constructor(private box: HostBox) {}
    public Set(box: HostBox): void { this.box = box; }
    public ApplyTo(host: HTMLElement): void {
        Object.defineProperty(host, 'offsetWidth', { configurable: true, get: () => this.box.Width });
        Object.defineProperty(host, 'offsetHeight', {
            configurable: true,
            get: () => {
                const chart = host.querySelector('.mj-chart') as HTMLElement | null;
                if (chart) this.DisplayAtRead.push(chart.style.display);
                return this.box.Height;
            },
        });
    }
}

async function render(inputs: Record<string, unknown> = {}, hostBox: HostBoxStub | null = null): Promise<{ fixture: ComponentFixture<MJChartFrameComponent>; surfaces: ChartSurface[] }> {
    const fixture = TestBed.createComponent(MJChartFrameComponent);
    hostBox?.ApplyTo(fixture.nativeElement as HTMLElement);
    const surfaces: ChartSurface[] = [];
    fixture.componentInstance.SurfaceChange.subscribe((s) => surfaces.push(s));
    const all = { AriaLabel: 'Sales', Status: { Kind: 'ok' }, Legend: legend, Table: table, ...inputs };
    for (const [k, v] of Object.entries(all)) fixture.componentRef.setInput(k, v);
    await settle(fixture);
    return { fixture, surfaces };
}

const original = window.ResizeObserver;
beforeEach(() => {
    FakeResizeObserver.Instances = [];
    window.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    vi.mocked(LogError).mockClear();
    vi.mocked(CreateTextMeasure).mockClear();
});
afterEach(() => { window.ResizeObserver = original; ClearOverlayContainers(); vi.restoreAllMocks(); });

const frameWait = async (f: ComponentFixture<unknown>): Promise<void> => {
    await new Promise((r) => setTimeout(r, 40));
    await f.whenStable();
};

describe('ResolveOuterHeight', () => {
    it('aspect ratio wins: 600 wide at 2:1 -> 300', () => expect(ResolveOuterHeight(600, 0, 400, 2)).toEqual({ Height: 300, FillFellBack: false }));
    it('aspect ratio clamps to the 120 minimum on narrow screens', () => expect(ResolveOuterHeight(200, 0, 300, 16 / 9).Height).toBe(120));
    it("'fill' uses the container height", () => expect(ResolveOuterHeight(600, 480, 'fill', null)).toEqual({ Height: 480, FillFellBack: false }));
    it("'fill' with no container height falls back to 300 and says so", () => expect(ResolveOuterHeight(600, 0, 'fill', null)).toEqual({ Height: 300, FillFellBack: true }));
    it('a number is used as-is (>= 120)', () => expect(ResolveOuterHeight(600, 999, 250, null).Height).toBe(250));
    it('a number below the minimum is clamped to 120', () => expect(ResolveOuterHeight(600, 0, 50, null).Height).toBe(120));
    it('a non-positive or non-finite aspect ratio is ignored', () => {
        expect(ResolveOuterHeight(600, 0, 250, 0).Height).toBe(250);
        expect(ResolveOuterHeight(600, 0, 250, Number.NaN).Height).toBe(250);
    });
});

describe('KeyToCommand', () => {
    it('maps navigation, activation and escape keys; ignores others', () => {
        expect(KeyToCommand('ArrowLeft')).toBe('ArrowLeft');
        expect(KeyToCommand('Home')).toBe('Home');
        expect(KeyToCommand('Enter')).toBe('Activate');
        expect(KeyToCommand(' ')).toBe('Activate');
        expect(KeyToCommand('Escape')).toBe('Escape');
        expect(KeyToCommand('a')).toBeNull();
    });
});

describe('MJChartFrameComponent — sizing', () => {
    it('reports the fallback width when the measured width is 0, minus the legend height', async () => {
        const { surfaces } = await render({ Height: 300 });
        const last = surfaces[surfaces.length - 1];
        expect(last.Size.Width).toBe(FallbackWidth);
        expect(last.Size.Height).toBe(300 - (20 + 8));
    });

    it('re-reports the surface after a ResizeObserver callback, without manual detectChanges', async () => {
        const { fixture, surfaces } = await render({ Height: 300 });
        FakeResizeObserver.Instances[0].Trigger(820);
        await new Promise((r) => setTimeout(r, 40));
        await fixture.whenStable();
        expect(surfaces[surfaces.length - 1].Size.Width).toBe(820);
    });

    it('repaints the legend after a ResizeObserver callback, without manual detectChanges', async () => {
        const many: LegendItem[] = Array.from({ length: 8 }, (_, i) => ({ Label: `S${i}`, Color: 'var(--mj-viz-1)', Key: `k${i}` }));
        const { fixture } = await render({ Height: 300, Legend: many });
        const items = (): number => fixture.nativeElement.querySelectorAll('.mj-chart-legend-item:not(.mj-chart-legend-more)').length;
        expect(items()).toBe(8);
        expect(fixture.nativeElement.querySelector('.mj-chart-legend-more')).toBeNull();
        FakeResizeObserver.Instances[0].Trigger(120);
        await new Promise((r) => setTimeout(r, 40));
        await fixture.whenStable();
        expect(items()).toBeLessThan(8);
        expect(fixture.nativeElement.querySelector('.mj-chart-legend-more')?.textContent).toMatch(/\+\d+ more/);
    });

    it('does not re-emit when the observed width is unchanged', async () => {
        const { fixture, surfaces } = await render({ Height: 300 });
        FakeResizeObserver.Instances[0].Trigger(820);
        await new Promise((r) => setTimeout(r, 40));
        await fixture.whenStable();
        const count = surfaces.length;
        FakeResizeObserver.Instances[0].Trigger(820);
        await new Promise((r) => setTimeout(r, 40));
        await fixture.whenStable();
        expect(surfaces.length).toBe(count);
    });

    it('coalesces two width changes before the next frame into one emit', async () => {
        const { fixture, surfaces } = await render({ Height: 300 });
        const count = surfaces.length;
        FakeResizeObserver.Instances[0].Trigger(300);
        FakeResizeObserver.Instances[0].Trigger(400);
        await new Promise((r) => setTimeout(r, 40));
        await fixture.whenStable();
        expect(surfaces.length).toBe(count + 1);
        expect(surfaces[surfaces.length - 1].Size.Width).toBe(400);
    });

    it('does not reserve legend height when the legend is not shown (empty state)', async () => {
        const { surfaces } = await render({ Height: 300, Status: { Kind: 'empty' } });
        expect(surfaces[surfaces.length - 1].Size.Height).toBe(300);
    });

    it('republishes the plot height when Status changes', async () => {
        const { fixture, surfaces } = await render({ Height: 300, Status: { Kind: 'empty' } });
        fixture.componentRef.setInput('Status', { Kind: 'ok' });
        await settle(fixture);
        expect(surfaces[surfaces.length - 1].Size.Height).toBe(300 - (20 + 8));
    });

    it('cancels a pending animation frame on destroy', async () => {
        const { fixture, surfaces } = await render({ Height: 300 });
        const published = surfaces.length;
        const cancel = vi.spyOn(window, 'cancelAnimationFrame');
        FakeResizeObserver.Instances[0].Trigger(820); // schedules a publish for the next frame
        fixture.destroy();
        expect(cancel).toHaveBeenCalledTimes(1);
        await new Promise((r) => setTimeout(r, 40));
        expect(surfaces.length).toBe(published);
        cancel.mockRestore();
    });

    it('publishes a whole-pixel width, flooring a fractional host width', async () => {
        const { fixture, surfaces } = await render({ Height: 300 });
        FakeResizeObserver.Instances[0].Trigger(820.9);
        await new Promise((r) => setTimeout(r, 40));
        await fixture.whenStable();
        expect(surfaces[surfaces.length - 1].Size.Width).toBe(820);
    });

    it('disconnects the observer on destroy', async () => {
        const { fixture } = await render();
        fixture.destroy();
        expect(FakeResizeObserver.Instances[0].Disconnect).toHaveBeenCalled();
    });
});

describe('MJChartFrameComponent — aspect ratio, fill height and font size', () => {
    const chartEl = (f: ComponentFixture<unknown>): HTMLElement => (f.nativeElement as HTMLElement).querySelector('.mj-chart') as HTMLElement;
    const legendHeight = 20 + 8;

    it('AspectRatio sizes the box from the width and wins over Height', async () => {
        const { fixture, surfaces } = await render({ Height: 400, AspectRatio: 2 });
        expect(surfaces[surfaces.length - 1].Size.Height).toBe(300 - legendHeight);
        expect(chartEl(fixture).style.height).toBe('300px');
    });

    it('the box height changes only with a publish: a check between a resize and its frame keeps the published height', async () => {
        const { fixture, surfaces } = await render({ Height: 300, AspectRatio: 2 }, new HostBoxStub({ Width: 600, Height: 0 }));
        expect(chartEl(fixture).style.height).toBe('300px');
        FakeResizeObserver.Instances[0].Trigger(800);
        fixture.componentRef.setInput('Announcement', 'unrelated change');
        fixture.detectChanges();
        expect(chartEl(fixture).style.height).toBe('300px');
        await frameWait(fixture);
        fixture.detectChanges();
        expect(chartEl(fixture).style.height).toBe('400px');
        expect(surfaces[surfaces.length - 1].Size.Height).toBe(400 - legendHeight);
    });

    /** Makes every element's transformed box `scale` times its layout box, as inside a dialog mid-way through a scale() animation. */
    function scaleBoundingBoxes(stub: HostBoxStub, box: HostBox, scale: number): void {
        stub.Set(box);
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() =>
            ({ width: box.Width * scale, height: box.Height * scale, x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect);
    }
    const refresh = async (f: ComponentFixture<unknown>, width: number, height = 0): Promise<void> => {
        FakeResizeObserver.Instances[0].Trigger(width, height);
        await frameWait(f);
        f.detectChanges();
    };

    it("Height='fill' in a definite-height parent takes the measured parent height", async () => {
        const { fixture } = await render({ Height: 'fill' }, new HostBoxStub({ Width: 800, Height: 480 }));
        expect(chartEl(fixture).style.height).toBe('480px');
        expect((fixture.nativeElement as HTMLElement).classList.contains('mj-chart-frame-fill')).toBe(true);
        expect(vi.mocked(LogError)).not.toHaveBeenCalled();
    });

    it("reads the fill height with the chart box out of flow, then restores its display", async () => {
        const stub = new HostBoxStub({ Width: 800, Height: 480 });
        const { fixture } = await render({ Height: 'fill' }, stub);
        expect(stub.DisplayAtRead).toContain('none');
        expect(chartEl(fixture).style.display).toBe('');
    });

    it('fill reads the layout height, not the transformed box: a parent scaled to 0.95 still gives 480px', async () => {
        const stub = new HostBoxStub({ Width: 800, Height: 480 });
        scaleBoundingBoxes(stub, { Width: 800, Height: 480 }, 0.95);
        const { fixture } = await render({ Height: 'fill' }, stub);
        expect(chartEl(fixture).style.height).toBe('480px');
    });

    it('the mount width is the layout width, not the transformed box: 800 wide scaled to 0.95 at AspectRatio 2 gives 400px', async () => {
        const stub = new HostBoxStub({ Width: 800, Height: 0 });
        scaleBoundingBoxes(stub, { Width: 800, Height: 0 }, 0.95);
        const { fixture, surfaces } = await render({ Height: 300, AspectRatio: 2 }, stub);
        expect(chartEl(fixture).style.height).toBe('400px');
        expect(surfaces[surfaces.length - 1].Size.Width).toBe(800);
    });

    it("Height='fill' in an auto-height parent (measure 0, width > 0) falls back to 300px and logs one hint naming the chart", async () => {
        const { fixture } = await render({ Height: 'fill', AriaLabel: 'Revenue by region' }, new HostBoxStub({ Width: 800, Height: 0 }));
        await refresh(fixture, 900);
        expect(chartEl(fixture).style.height).toBe('300px');
        expect(vi.mocked(LogError)).toHaveBeenCalledTimes(1);
        const message = String(vi.mocked(LogError).mock.calls[0][0]);
        expect(message).toContain('fill');
        expect(message).toContain('Revenue by region');
    });

    it('a hidden host (0 wide, 0 tall) neither logs nor changes the last good fill height', async () => {
        const stub = new HostBoxStub({ Width: 800, Height: 480 });
        const { fixture } = await render({ Height: 'fill' }, stub);
        expect(chartEl(fixture).style.height).toBe('480px');
        stub.Set({ Width: 0, Height: 0 });
        await refresh(fixture, 0, 0);
        expect(chartEl(fixture).style.height).toBe('480px');
        expect(vi.mocked(LogError)).not.toHaveBeenCalled();
    });

    it('a host that starts hidden uses the fallback height silently', async () => {
        const { fixture } = await render({ Height: 'fill' }, new HostBoxStub({ Width: 0, Height: 0 }));
        expect(chartEl(fixture).style.height).toBe('300px');
        expect(vi.mocked(LogError)).not.toHaveBeenCalled();
    });

    it("switching Height from 500 to 'fill' in a parent with no height uses 300px, not the old 500px", async () => {
        const { fixture } = await render({ Height: 500 }, new HostBoxStub({ Width: 800, Height: 0 }));
        expect(chartEl(fixture).style.height).toBe('500px');
        fixture.componentRef.setInput('Height', 'fill');
        await settle(fixture);
        await frameWait(fixture);
        fixture.detectChanges();
        expect(chartEl(fixture).style.height).toBe('300px');
    });

    it('a parent-height change alone republishes in fill mode', async () => {
        const stub = new HostBoxStub({ Width: 800, Height: 480 });
        const { fixture } = await render({ Height: 'fill' }, stub);
        stub.Set({ Width: 800, Height: 520 });
        await refresh(fixture, 800, 520);
        expect(chartEl(fixture).style.height).toBe('520px');
    });

    it('a numeric Height never logs the fill hint', async () => {
        await render({ Height: 250 });
        expect(vi.mocked(LogError)).not.toHaveBeenCalled();
    });

    it('measures the chart root\'s computed font size, publishes it, and scales the legend rows with it', async () => {
        const realComputedStyle = window.getComputedStyle.bind(window);
        vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) =>
            el.classList.contains('mj-chart') ? ({ fontSize: '18px', fontFamily: 'Inter' } as CSSStyleDeclaration) : realComputedStyle(el, pseudo));
        const { fixture, surfaces } = await render({ Height: 400 });
        expect(surfaces[0].FontSize).toBe(18);
        const legendEl = (fixture.nativeElement as HTMLElement).querySelector('.mj-chart-legend') as HTMLElement;
        const rowHeight = TypeMetrics(18).LegendRowHeight;
        expect(legendEl.style.lineHeight).toBe(`${rowHeight}px`);
        expect(surfaces[surfaces.length - 1].Size.Height).toBe(400 - (rowHeight + 8));
    });

    it('falls back to 12px when the computed font size is unusable (jsdom does not resolve var())', async () => {
        const { surfaces } = await render({ Height: 300 });
        expect(surfaces[surfaces.length - 1].FontSize).toBe(12);
    });

    it('keeps the same Measure while the font is unchanged, across republishes', async () => {
        const { fixture, surfaces } = await render({ Height: 300 });
        FakeResizeObserver.Instances[0].Trigger(820);
        await frameWait(fixture);
        expect(surfaces.length).toBeGreaterThan(1);
        expect(surfaces[surfaces.length - 1].Measure).toBe(surfaces[0].Measure);
    });

    describe('aspect-ratio width echo (scrollbar A -> B -> A)', () => {
        afterEach(() => vi.useRealTimers());
        const widthAt = async (f: ComponentFixture<unknown>, width: number): Promise<void> => {
            FakeResizeObserver.Instances[0].Trigger(width);
            await frameWait(f);
        };
        /** Mounts with the host laid out `width` wide, so the mount width is the first recorded width (jsdom alone mounts hidden). */
        const renderVisible = (inputs: Record<string, unknown>, width = 600): ReturnType<typeof render> =>
            render(inputs, new HostBoxStub({ Width: width, Height: 0 }));
        /** 600 -> 615 -> 600 inside the window at AspectRatio 2: the box holds 308px. */
        const holdAt308 = async (f: ComponentFixture<unknown>): Promise<void> => {
            await widthAt(f, 615);
            vi.advanceTimersByTime(100);
            await widthAt(f, 600);
            f.detectChanges();
            expect(chartEl(f).style.height).toBe('308px');
        };

        it('applies an echoed width but holds the outer height: 600 -> 615 -> 600 keeps the 615 height', async () => {
            vi.useFakeTimers({ toFake: ['performance'] });
            const { fixture, surfaces } = await renderVisible({ Height: 300, AspectRatio: 2 });
            const chart = (): HTMLElement => (fixture.nativeElement as HTMLElement).querySelector('.mj-chart') as HTMLElement;
            expect(chart().style.height).toBe('300px');
            await widthAt(fixture, 615);
            fixture.detectChanges();
            expect(chart().style.height).toBe('308px');
            vi.advanceTimersByTime(100);
            await widthAt(fixture, 600);
            fixture.detectChanges();
            expect(surfaces).toHaveLength(3);
            expect(surfaces[2].Size.Width).toBe(600);
            expect(surfaces[2].Size.Height).toBe(surfaces[1].Size.Height);
            expect(chart().style.height).toBe('308px');
        });

        it('keeps holding through a repeated A/B/A/B cycle inside the window', async () => {
            vi.useFakeTimers({ toFake: ['performance'] });
            const { fixture, surfaces } = await renderVisible({ Height: 300, AspectRatio: 2 });
            await widthAt(fixture, 615);
            for (const width of [600, 615, 600]) {
                vi.advanceTimersByTime(50);
                await widthAt(fixture, width);
            }
            expect(surfaces[surfaces.length - 1].Size.Width).toBe(600);
            expect(new Set(surfaces.slice(1).map((s) => s.Size.Height))).toEqual(new Set([surfaces[1].Size.Height]));
        });

        it('resumes the ratio on the next non-echo width: 700 after the window -> 350', async () => {
            vi.useFakeTimers({ toFake: ['performance'] });
            const { fixture, surfaces } = await renderVisible({ Height: 300, AspectRatio: 2 });
            const chart = (): HTMLElement => (fixture.nativeElement as HTMLElement).querySelector('.mj-chart') as HTMLElement;
            await widthAt(fixture, 615);
            vi.advanceTimersByTime(100);
            await widthAt(fixture, 600);
            vi.advanceTimersByTime(600);
            await widthAt(fixture, 700);
            fixture.detectChanges();
            expect(chart().style.height).toBe('350px');
            expect(surfaces[surfaces.length - 1].Size.Width).toBe(700);
        });

        it('accepts the same return after 600ms with its own ratio height (no hold)', async () => {
            vi.useFakeTimers({ toFake: ['performance'] });
            const { fixture, surfaces } = await renderVisible({ Height: 300, AspectRatio: 2 });
            await widthAt(fixture, 615);
            vi.advanceTimersByTime(600);
            await widthAt(fixture, 600);
            expect(surfaces).toHaveLength(3);
            expect(surfaces[2].Size.Width).toBe(600);
            expect(surfaces[2].Size.Height).toBe(surfaces[0].Size.Height);
        });

        it('a hide then a show within the window is not an echo: 800 -> 0 -> 800 gives 400px, and the hide publishes nothing', async () => {
            vi.useFakeTimers({ toFake: ['performance'] });
            const { fixture, surfaces } = await render({ Height: 300, AspectRatio: 2 });
            await widthAt(fixture, 800);
            const published = surfaces.length;
            vi.advanceTimersByTime(100);
            await widthAt(fixture, 0);
            expect(surfaces).toHaveLength(published);
            vi.advanceTimersByTime(100);
            await widthAt(fixture, 800);
            fixture.detectChanges();
            expect(chartEl(fixture).style.height).toBe('400px');
            expect(surfaces[surfaces.length - 1].Size).toEqual({ Width: 800, Height: 400 - legendHeight });
        });

        it('a hide keeps the last visible width: 1200 -> hidden -> 1200 at 16/9 never publishes the 600 fallback or its height', async () => {
            vi.useFakeTimers({ toFake: ['performance'] });
            const { fixture, surfaces } = await renderVisible({ Height: 300, AspectRatio: 16 / 9 }, 1200);
            expect(chartEl(fixture).style.height).toBe('675px');
            await widthAt(fixture, 0);
            fixture.detectChanges();
            expect(chartEl(fixture).style.height).toBe('675px');
            await widthAt(fixture, 1200);
            fixture.detectChanges();
            expect(chartEl(fixture).style.height).toBe('675px');
            expect(surfaces.map((s) => s.Size.Width)).toEqual([1200]);
        });

        it('a width from before a hide never pairs with one after it: 615 -> 0 -> 600 -> 615 inside the window gives 308px', async () => {
            vi.useFakeTimers({ toFake: ['performance'] });
            const { fixture } = await render({ Height: 300, AspectRatio: 2 });
            await widthAt(fixture, 615);
            await widthAt(fixture, 0);
            await widthAt(fixture, 600);
            vi.advanceTimersByTime(50);
            await widthAt(fixture, 615);
            fixture.detectChanges();
            expect(chartEl(fixture).style.height).toBe('308px');
        });

        it('a hidden mount records no width: hidden -> 615 -> 600 inside the window is not an echo (300px)', async () => {
            vi.useFakeTimers({ toFake: ['performance'] });
            const { fixture } = await render({ Height: 300, AspectRatio: 2 }, new HostBoxStub({ Width: 0, Height: 0 }));
            await widthAt(fixture, 615);
            vi.advanceTimersByTime(100);
            await widthAt(fixture, 600);
            fixture.detectChanges();
            expect(chartEl(fixture).style.height).toBe('300px');
        });

        it('a hide releases a held height without publishing; a show at 900 gives 450px', async () => {
            vi.useFakeTimers({ toFake: ['performance'] });
            const { fixture, surfaces } = await renderVisible({ Height: 300, AspectRatio: 2 });
            await holdAt308(fixture);
            const published = surfaces.length;
            vi.advanceTimersByTime(50);
            await widthAt(fixture, 0);
            fixture.detectChanges();
            expect(surfaces).toHaveLength(published);
            expect(chartEl(fixture).style.height).toBe('308px');
            vi.advanceTimersByTime(50);
            await widthAt(fixture, 900);
            fixture.detectChanges();
            expect(chartEl(fixture).style.height).toBe('450px');
        });

        it('a hold released by a hide is applied by the show, even at the unchanged width: show at 600 gives 300px', async () => {
            vi.useFakeTimers({ toFake: ['performance'] });
            const { fixture, surfaces } = await renderVisible({ Height: 300, AspectRatio: 2 });
            await holdAt308(fixture);
            const published = surfaces.length;
            await widthAt(fixture, 0);
            expect(surfaces).toHaveLength(published);
            await widthAt(fixture, 600);
            fixture.detectChanges();
            expect(chartEl(fixture).style.height).toBe('300px');
            expect(surfaces[surfaces.length - 1].Size).toEqual({ Width: 600, Height: 300 - legendHeight });
        });

        it('a show after a hide seeds the history even at the unchanged width: 600, hide, 600, 615, 600 holds 308px', async () => {
            vi.useFakeTimers({ toFake: ['performance'] });
            const { fixture } = await renderVisible({ Height: 300, AspectRatio: 2 });
            await widthAt(fixture, 0);
            await widthAt(fixture, 600);
            vi.advanceTimersByTime(50);
            await widthAt(fixture, 615);
            vi.advanceTimersByTime(50);
            await widthAt(fixture, 600);
            fixture.detectChanges();
            expect(chartEl(fixture).style.height).toBe('308px');
        });

        it('a genuine back-and-forth resize is not an echo: 1200 -> 900 -> 1200 inside the window at 16/9 gives 675px', async () => {
            vi.useFakeTimers({ toFake: ['performance'] });
            const { fixture } = await renderVisible({ Height: 300, AspectRatio: 16 / 9 }, 1200);
            await widthAt(fixture, 900);
            vi.advanceTimersByTime(100);
            await widthAt(fixture, 1200);
            fixture.detectChanges();
            expect(chartEl(fixture).style.height).toBe('675px');
        });

        it('an AspectRatio change releases a held height: hold at 308px, then AspectRatio 1 gives 600px', async () => {
            vi.useFakeTimers({ toFake: ['performance'] });
            const { fixture } = await renderVisible({ Height: 300, AspectRatio: 2 });
            await holdAt308(fixture);
            fixture.componentRef.setInput('AspectRatio', 1);
            await settle(fixture);
            await frameWait(fixture);
            fixture.detectChanges();
            expect(chartEl(fixture).style.height).toBe('600px');
        });

        it('a Height change releases a held height: hold at 308px, then Height 400 (ratio still wins) gives 300px', async () => {
            vi.useFakeTimers({ toFake: ['performance'] });
            const { fixture } = await renderVisible({ Height: 300, AspectRatio: 2 });
            await holdAt308(fixture);
            fixture.componentRef.setInput('Height', 400);
            await settle(fixture);
            await frameWait(fixture);
            fixture.detectChanges();
            expect(chartEl(fixture).style.height).toBe('300px');
        });

        it('does not damp without an aspect ratio', async () => {
            vi.useFakeTimers({ toFake: ['performance'] });
            const { fixture, surfaces } = await render({ Height: 300 });
            await widthAt(fixture, 615);
            await widthAt(fixture, 600);
            expect(surfaces).toHaveLength(3);
        });
    });

    it('builds the text measure for the computed font size and family', async () => {
        const realComputedStyle = window.getComputedStyle.bind(window);
        vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) =>
            el.classList.contains('mj-chart') ? ({ fontSize: '18px', fontFamily: 'Inter' } as CSSStyleDeclaration) : realComputedStyle(el, pseudo));
        await render({ Height: 300 });
        expect(vi.mocked(CreateTextMeasure)).toHaveBeenCalledWith('Inter', 18);
    });

    it('a family-only change (same size) rebuilds the Measure', async () => {
        let fontFamily = 'Inter';
        const realComputedStyle = window.getComputedStyle.bind(window);
        vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) =>
            el.classList.contains('mj-chart') ? ({ fontSize: '14px', fontFamily } as CSSStyleDeclaration) : realComputedStyle(el, pseudo));
        const { fixture, surfaces } = await render({ Height: 300 });
        const first = surfaces[surfaces.length - 1];
        fontFamily = 'Georgia';
        fixture.componentRef.setInput('Height', 301);
        await settle(fixture);
        await frameWait(fixture);
        const last = surfaces[surfaces.length - 1];
        expect(last.Measure).not.toBe(first.Measure);
        expect(last.FontSize).toBe(14);
        expect(vi.mocked(CreateTextMeasure)).toHaveBeenLastCalledWith('Georgia', 14);
    });

    it('a font-size change republishes the surface with the new FontSize', async () => {
        let fontSize = '12px';
        const realComputedStyle = window.getComputedStyle.bind(window);
        vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) =>
            el.classList.contains('mj-chart') ? ({ fontSize, fontFamily: 'Inter' } as CSSStyleDeclaration) : realComputedStyle(el, pseudo));
        const { fixture, surfaces } = await render({ Height: 300, ShowLegend: false });
        const count = surfaces.length;
        fontSize = '18px';
        fixture.componentRef.setInput('Height', 301);
        fixture.componentRef.setInput('Height', 300);
        await settle(fixture);
        await frameWait(fixture);
        expect(surfaces.length).toBe(count + 1);
        expect(surfaces[surfaces.length - 1].FontSize).toBe(18);
    });
});

describe('MJChartFrameComponent — first paint', () => {
    it('sizes the first render from Height/AspectRatio set before it, not the 300px default (no one-frame jump)', () => {
        const fixed = TestBed.createComponent(MJChartFrameComponent);
        fixed.componentRef.setInput('Height', 200);
        expect(fixed.componentInstance.OuterHeight).toBe(200);
        const ratio = TestBed.createComponent(MJChartFrameComponent);
        ratio.componentRef.setInput('AspectRatio', 2);
        expect(ratio.componentInstance.OuterHeight).toBe(300); // FallbackWidth 600 / 2 — the best guess before a measure
        ratio.componentRef.setInput('AspectRatio', 4);
        expect(ratio.componentInstance.OuterHeight).toBe(150);
    });
});

describe('MJChartFrameComponent — states and accessibility', () => {
    it('is a labelled, focusable group with a hidden data table and help text', async () => {
        const { fixture } = await render();
        const group = fixture.nativeElement.querySelector('.mj-chart') as HTMLElement;
        expect(group.getAttribute('role')).toBe('group');
        expect(group.getAttribute('tabindex')).toBe('0');
        expect(group.getAttribute('aria-label')).toBe('Sales');
        const help = fixture.nativeElement.querySelector(`#${group.getAttribute('aria-describedby')}`);
        expect(help?.textContent).toContain('arrow keys');
        expect(fixture.nativeElement.querySelector('table caption')?.textContent).toContain('Sales');
    });

    it('clips the hidden data table with a wrapper, because a table ignores width: 1px and would widen the page', async () => {
        const { fixture } = await render();
        const table = fixture.nativeElement.querySelector('table') as HTMLTableElement;
        expect(table.classList.contains('mj-chart-sr-only')).toBe(false);
        expect(table.parentElement?.tagName).toBe('DIV');
        expect(table.parentElement?.classList.contains('mj-chart-sr-only')).toBe(true);
    });

    it('shows the empty message and no legend in the empty state', async () => {
        const { fixture } = await render({ Status: { Kind: 'empty' }, EmptyMessage: 'Nothing yet' });
        expect(fixture.nativeElement.querySelector('.mj-chart-state')?.textContent).toContain('Nothing yet');
        expect(fixture.nativeElement.querySelector('.mj-chart-legend')).toBeNull();
    });

    it('shows the invalid state', async () => {
        const { fixture } = await render({ Status: { Kind: 'invalid', Code: 'length-mismatch', Detail: 'x' } });
        expect(fixture.nativeElement.querySelector('.mj-chart-state-invalid')).not.toBeNull();
    });

    it('renders the announcement into a polite live region', async () => {
        const { fixture } = await render({ Announcement: 'Q1, A, 1' });
        expect(fixture.nativeElement.querySelector('[aria-live="polite"]')?.textContent).toContain('Q1, A, 1');
    });

    it('gives two frames distinct fragment ids', async () => {
        const a = await render();
        const b = await render();
        const idA = a.fixture.nativeElement.querySelector('.mj-chart').getAttribute('aria-describedby');
        const idB = b.fixture.nativeElement.querySelector('.mj-chart').getAttribute('aria-describedby');
        expect(idA).not.toBe(idB);
    });

    it('emits key commands and focus changes', async () => {
        const { fixture } = await render();
        const keys: string[] = [];
        const focus: boolean[] = [];
        fixture.componentInstance.KeyCommand.subscribe((k) => keys.push(k));
        fixture.componentInstance.FocusChange.subscribe((f) => focus.push(f));
        const group = fixture.nativeElement.querySelector('.mj-chart') as HTMLElement;
        group.dispatchEvent(new FocusEvent('focus'));
        group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        group.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        group.dispatchEvent(new FocusEvent('blur'));
        expect(keys).toEqual(['ArrowRight', 'Activate']);
        expect(focus).toEqual([true, false]);
    });
});

describe('MJChartFrameComponent — tooltip', () => {
    it('emits Escape when Escape is pressed on the group', async () => {
        const { fixture } = await render();
        const keys: string[] = [];
        fixture.componentInstance.KeyCommand.subscribe((k) => keys.push(k));
        const group = fixture.nativeElement.querySelector('.mj-chart') as HTMLElement;
        group.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(keys).toEqual(['Escape']);
    });

    it('emits Escape through the overlay keydown path while the tooltip is open', async () => {
        const { fixture } = await render({ Tooltip: { Title: 'Q1', Rows: [] }, TooltipAnchor: { X: 1, Y: 1 } });
        expect(OverlayQuery('.mj-chart-tooltip')).not.toBeNull();
        const keys: string[] = [];
        fixture.componentInstance.KeyCommand.subscribe((k) => keys.push(k));
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(keys).toEqual(['Escape']);
    });

    it('opens a CDK overlay tooltip when a model and anchor are set, and closes when cleared', async () => {
        const { fixture } = await render({
            Tooltip: { Title: 'Q1', Rows: [{ Label: 'A', Value: '1', Color: 'var(--mj-viz-1)', Active: true, Key: 's0' }] },
            TooltipAnchor: { X: 10, Y: 20 },
        });
        expect(OverlayQuery('.mj-chart-tooltip[role="tooltip"]')?.textContent).toContain('Q1');
        fixture.componentRef.setInput('Tooltip', null);
        await settle(fixture);
        expect(OverlayQuery('.mj-chart-tooltip')).toBeNull();
    });

    it('defaults to placing the tooltip above the anchor, with right/left/below as fallbacks', async () => {
        const { fixture } = await render();
        const first = fixture.componentInstance.TooltipPositions[0];
        expect(fixture.componentInstance.TooltipPlacement).toBe('above');
        expect(first).toMatchObject({ originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom' });
        expect(fixture.componentInstance.TooltipPositions).toHaveLength(4);
    });

    it("TooltipPlacement 'right' orders right-of-anchor first (offset 8, vertically centered), then below, above, and left last", async () => {
        // Left is the last resort: the anchor is the right end of the row's own bar, so a
        // left-placed tooltip would sit over that bar, under the pointer.
        const { fixture } = await render({ TooltipPlacement: 'right' });
        const [right, below, above, left] = fixture.componentInstance.TooltipPositions;
        expect(right).toMatchObject({ originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 8 });
        expect(below).toMatchObject({ originY: 'bottom', overlayY: 'top' });
        expect(above).toMatchObject({ originY: 'top', overlayY: 'bottom' });
        expect(left).toMatchObject({ originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -8 });
    });

    it('keeps the same positions array while the placement is unchanged (no overlay churn on every check)', async () => {
        const { fixture } = await render({ TooltipPlacement: 'right' });
        const first = fixture.componentInstance.TooltipPositions;
        fixture.detectChanges();
        expect(fixture.componentInstance.TooltipPositions).toBe(first);
    });

    it('reports pointer hover on the tooltip itself', async () => {
        const { fixture } = await render({ Tooltip: { Title: 'Q1', Rows: [] }, TooltipAnchor: { X: 1, Y: 1 } });
        const hovers: boolean[] = [];
        fixture.componentInstance.TooltipHoverChange.subscribe((h) => hovers.push(h));
        const tip = OverlayQuery('.mj-chart-tooltip') as HTMLElement;
        tip.dispatchEvent(new MouseEvent('pointerenter'));
        tip.dispatchEvent(new MouseEvent('pointerleave'));
        expect(hovers).toEqual([true, false]);
    });
});
