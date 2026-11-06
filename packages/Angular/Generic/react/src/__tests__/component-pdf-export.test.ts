import { describe, it, expect, vi } from 'vitest';
import { EnterPrintMode, HorizontalOverflow, PageLayoutWidth, PdfFileName, PinLayoutWidth, PlanPdfPages, SharpenCharts, TableLeadBlock } from '../lib/export/component-pdf-export';

/** jsdom has no layout: give an element the scroll and client heights a browser would report. */
function setHeights(element: HTMLElement, scrollHeight: number, clientHeight: number): void {
    Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => scrollHeight });
    Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => clientHeight });
}

describe('PlanPdfPages', () => {
    it('fits a tall capture to the A4 portrait width and cuts it into page-height bands', () => {
        const plan = PlanPdfPages(1900, 5000);
        expect(plan).toMatchObject({ Orientation: 'portrait', PageWidthMM: 210, PageHeightMM: 297, DrawWidthMM: 190 });
        // 277mm of usable height at 190mm / 1900px = 0.1 mm per pixel
        expect(plan.Slices.map(s => [s.SourceY, s.SourceHeight])).toEqual([[0, 2770], [2770, 2230]]);
        expect(plan.Slices[1].DrawHeightMM).toBeCloseTo(223);
    });

    it('uses the requested orientation, and one page when the capture fits', () => {
        const plan = PlanPdfPages(3000, 1000, 'landscape');
        expect(plan.Orientation).toBe('landscape');
        expect(plan.Slices).toHaveLength(1);
        expect(plan.Slices[0]).toMatchObject({ SourceY: 0, SourceHeight: 1000 });
    });
});

describe('PlanPdfPages page breaks', () => {
    // 1900px wide: a page holds 2770px (0.1 mm per pixel on 190mm)
    const heights = (blocks: Parameters<typeof PlanPdfPages>[3]) =>
        PlanPdfPages(1900, 5000, 'portrait', blocks).Slices.map(s => s.SourceHeight);

    it('moves a cut to the top of a row or chart it would split, however far back, when it fits a page', () => {
        expect(heights([{ Top: 2700, Bottom: 2800, Atomic: true }])).toEqual([2700, 2300]);
        // a 2200px chart starting at 1300 that even a shrunk page cannot hold: the page ends at its top
        expect(heights([{ Top: 1300, Bottom: 3500, Atomic: true }])[0]).toBe(1300);
    });

    it('splits a large card between its children, but moves it whole when only its header would stay behind', () => {
        const card = { Top: 1000, Bottom: 3500, Atomic: false };
        const rows = [{ Top: 2700, Bottom: 2790, Atomic: true }];
        expect(heights([card, ...rows])[0]).toBe(2700);           // split between rows inside the card
        const lateCard = { Top: 2400, Bottom: 3800, Atomic: false }; // only 370px (< 15% of a page) above the cut: its title
        expect(heights([lateCard])[0]).toBe(2400);
    });

    it('keeps small containers together and splits anything taller than a page', () => {
        expect(heights([{ Top: 2650, Bottom: 2900, Atomic: false }])[0]).toBe(2650); // a KPI tile: < 15% of a page
        expect(heights([{ Top: 500, Bottom: 3400, Atomic: true }])[0]).toBe(2770);   // taller than a page
    });

    it('moves a card that fits a page whole when only its last lines would carry over', () => {
        // 130px (< 15% of a page) would carry over; moving the card leaves the page 83% full, so no shrink
        expect(heights([{ Top: 2300, Bottom: 2900, Atomic: false }])[0]).toBe(2300);
    });

    it('keeps a table header row or heading on the page of what follows it', () => {
        const thead = { Top: 2600, Bottom: 2700, Atomic: false, KeepWithNext: true };
        const firstRow = { Top: 2700, Bottom: 2790, Atomic: true };
        expect(heights([thead, firstRow])[0]).toBe(2600);
    });

    it('drops the layout rules before giving up when they would leave the page nearly empty', () => {
        // A chart welded to the cards around it: the layout rules chain the cut up to 150px; the never-split
        // rule alone stops it at the top of the row it falls in.
        const blocks = [
            { Top: 150, Bottom: 2900, Atomic: false }, { Top: 2700, Bottom: 2800, Atomic: true },
            { Top: 100, Bottom: 2800, Atomic: false },
        ];
        expect(heights(blocks)[0]).toBe(2700);
    });

    it('shrinks a page to fit when keeping a chart together would leave it mostly empty', () => {
        // a 1500px chart at 1300 overshoots the 2770px page; a page 20% taller (3324px) holds it
        const plan = PlanPdfPages(1900, 5000, 'portrait', [{ Top: 1300, Bottom: 2800, Atomic: true }, { Top: 2800, Bottom: 3324, Atomic: false }]);
        const first = plan.Slices[0];
        expect(first.SourceHeight).toBe(3324);
        expect(first.DrawHeightMM).toBeCloseTo(277);                 // scaled down to the printable height
        expect(first.DrawWidthMM).toBeCloseTo(190 * 2770 / 3324);    // and narrower, centred
        expect(first.XMM).toBeCloseTo(10 + (190 - first.DrawWidthMM) / 2);
    });

    it('folds a sliver that would be alone on the last page into a shrunk page', () => {
        // 2900px of content: 130px (a couple of rows) would carry onto page 2
        expect(PlanPdfPages(1900, 2900, 'portrait').Slices.map(s => s.SourceHeight)).toEqual([2900]);
    });

    it('does not shrink a page that is already mostly full', () => {
        const plan = PlanPdfPages(1900, 5000, 'portrait', [{ Top: 2300, Bottom: 2900, Atomic: true }]);
        expect(plan.Slices[0]).toMatchObject({ SourceHeight: 2300, DrawWidthMM: 190, XMM: 10 });
    });

    it('cuts on whole pixels when element positions are fractional', () => {
        const slices = PlanPdfPages(1900, 5000, 'portrait', [{ Top: 2700.40625, Bottom: 2790.2, Atomic: true }]).Slices;
        expect(slices.map(s => s.SourceHeight)).toEqual([2700, 2300]);
        expect(slices.every(s => Number.isInteger(s.SourceY) && Number.isInteger(s.SourceHeight))).toBe(true);
    });

    it('cuts where the page ends when moving the break would leave the page nearly empty', () => {
        expect(heights([{ Top: 100, Bottom: 2800, Atomic: true }])[0]).toBe(2770);
    });
});

describe('PageLayoutWidth', () => {
    it('is the printable width at 96 dpi: 190mm portrait, 277mm landscape', () => {
        expect(PageLayoutWidth('portrait')).toBe(718);
        expect(PageLayoutWidth('landscape')).toBe(1047);
    });

    it('is applied to the root by PinLayoutWidth and removed on restore', () => {
        document.body.innerHTML = '<div id="root" style="height: 100%"></div>';
        const root = document.getElementById('root') as HTMLElement;
        const restore = PinLayoutWidth(root, PageLayoutWidth('portrait'));
        expect(root.style.width).toBe('718px');
        expect(root.style.position).toBe('absolute'); // out of the host's flow, so its width cannot widen the panes
        restore();
        expect(root.style.cssText).toBe('height: 100%;');
    });
});

describe('PdfFileName', () => {
    it('names the file <title>_<date>.pdf with unsafe characters replaced', () => {
        expect(PdfFileName('Revenue / Month: 2026', new Date(2026, 10, 5))).toBe('Revenue _ Month_ 2026_2026-11-05.pdf');
        expect(PdfFileName(undefined, new Date(2026, 0, 9))).toBe('component_2026-01-09.pdf');
    });
});

describe('EnterPrintMode', () => {
    it('grows the root at its width, expands clipping elements, leaves the host alone, then restores', () => {
        document.body.innerHTML = `
          <div id="pane" style="height: 400px; overflow: auto">
            <div id="root" style="height: 100%">
              <div id="column" style="display: flex; flex-direction: column; height: 300px">
                <div id="card" style="height: 250px; overflow: visible">
                  <div id="scroller" style="height: 200px; overflow-y: auto"></div>
                </div>
              </div>
              <div id="row" style="display: flex">
                <div id="row-scroller" style="height: 100px; overflow-y: auto"></div>
              </div>
              <div id="overlay-host" style="height: 50px; overflow: visible"></div>
            </div>
          </div>`;
        const get = (id: string) => document.getElementById(id) as HTMLElement;
        const root = get('root');
        root.getBoundingClientRect = () => ({ width: 640 } as DOMRect);
        setHeights(get('scroller'), 900, 200);   // clips its rows
        setHeights(get('card'), 1000, 250);      // spills once the scroller grows
        setHeights(get('row-scroller'), 300, 100);
        setHeights(get('overlay-host'), 120, 50); // an absolutely positioned overlay pokes out; not a clipper's ancestor

        const restore = EnterPrintMode(root);
        expect(get('pane').style.cssText).toBe('height: 400px; overflow: auto;');
        expect(root.style.width).toBe('640px');
        expect(root.style.height).toBe('auto');
        expect(get('scroller').style.height).toBe('auto');
        expect(get('scroller').style.overflowY).toBe('visible');
        expect(get('card').style.height).toBe('auto');
        expect(get('card').style.flex).toMatch(/^(none|0 0 auto)$/); // in a column flex: flex: none
        expect(get('row-scroller').style.height).toBe('auto');
        expect(get('row-scroller').style.flex).toBe('');             // in a row flex: left alone
        expect(get('overlay-host').style.height).toBe('50px');

        restore();
        expect(root.style.cssText).toBe('height: 100%;');
        expect(get('scroller').style.cssText).toBe('height: 200px; overflow-y: auto;');
        expect(get('card').style.cssText).toBe('height: 250px; overflow: visible;');
        expect(get('row-scroller').style.cssText).toBe('height: 100px; overflow-y: auto;');
    });
});

describe('EnterPrintMode horizontal scrollers', () => {
    it('releases a sideways scroller so no column is lost, but never an ellipsis cell', () => {
        document.body.innerHTML = `
          <div id="root">
            <div id="grid-scroll" style="overflow-x: auto; contain: inline-size"><table></table></div>
            <div id="ellipsis" style="overflow: hidden; white-space: nowrap; width: 80px">a very long cell value</div>
          </div>`;
        const get = (id: string) => document.getElementById(id) as HTMLElement;
        get('root').getBoundingClientRect = () => ({ width: 718 } as DOMRect);
        for (const id of ['grid-scroll', 'ellipsis']) {
            Object.defineProperty(get(id), 'scrollWidth', { configurable: true, get: () => 1100 });
            Object.defineProperty(get(id), 'clientWidth', { configurable: true, get: () => 600 });
        }
        const restore = EnterPrintMode(get('root'));
        expect(get('grid-scroll').style.overflowX).toBe('visible');
        expect(get('grid-scroll').style.contain).toBe('none');
        expect(get('ellipsis').style.overflow).toBe('hidden');
        restore();
        expect(get('grid-scroll').style.cssText).toBe('overflow-x: auto; contain: inline-size;');
    });
});

describe('TableLeadBlock', () => {
    it('spans from the card title through the header row to the first data row, but not past the lead limit', () => {
        document.body.innerHTML = `
          <div id="root"><div id="page-section"><div id="card"><h3>Member Directory</h3><input/>
            <div id="grid"><table><thead><tr><th>Name</th></tr></thead><tbody><tr id="r1"><td>a</td></tr></tbody></table></div></div></div></div>`;
        const tops: Record<string, [number, number]> = { 'page-section': [0, 2000], card: [700, 1600], grid: [800, 1600], r1: [860, 900] };
        for (const [id, [top, bottom]] of Object.entries(tops)) {
            (document.getElementById(id) as HTMLElement).getBoundingClientRect = () => ({ top, bottom, height: bottom - top } as DOMRect);
        }
        const table = document.querySelector('table') as HTMLTableElement;
        table.getBoundingClientRect = () => ({ top: 820, bottom: 1600, height: 780 } as DOMRect);
        // the card starts 120px above the table (within 200), the page section 820px above (beyond it)
        expect(TableLeadBlock(table, document.getElementById('root') as HTMLElement, 200)).toEqual({ top: 700, bottom: 900 });
    });

    it('walks past box-less wrappers (display: contents) instead of stopping at them', () => {
        document.body.innerHTML = `
          <div id="root"><div id="card"><h3>Member Directory</h3>
            <div id="contents" style="display: contents"><div id="grid"><table><tbody><tr id="r1"><td>a</td></tr></tbody></table></div></div></div></div>`;
        const rects: Record<string, [number, number, number]> = { card: [700, 1600, 600], contents: [0, 0, 0], grid: [800, 1600, 600], r1: [860, 900, 600] };
        for (const [id, [top, bottom, width]] of Object.entries(rects)) {
            (document.getElementById(id) as HTMLElement).getBoundingClientRect = () => ({ top, bottom, width, height: bottom - top } as DOMRect);
        }
        const table = document.querySelector('table') as HTMLTableElement;
        table.getBoundingClientRect = () => ({ top: 820, bottom: 1600, width: 600, height: 780 } as DOMRect);
        expect(TableLeadBlock(table, document.getElementById('root') as HTMLElement, 200)).toEqual({ top: 700, bottom: 900 });
    });
});

describe('HorizontalOverflow', () => {
    it('measures content running past its card even when the root is not wider, ignoring ellipsis cells', () => {
        document.body.innerHTML = `
          <div id="root"><div id="card" style="padding: 12px"><table><tr><td>a</td></tr></table></div>
            <div id="ellipsis" style="overflow: hidden"><span>a long truncated value</span></div></div>`;
        const set = (id: string, scroll: number, client: number) => {
            const el = document.getElementById(id) as HTMLElement;
            Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => scroll });
            Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => client });
        };
        set('root', 718, 718);
        set('card', 925, 718);     // the table spills 207px into and past the card's padding
        set('ellipsis', 2000, 300); // clips on purpose
        expect(HorizontalOverflow(document.getElementById('root') as HTMLElement)).toBe(207);
    });
});

describe('SharpenCharts', () => {
    it('re-renders Chart.js charts at a capture pixel ratio without animation, then restores them', () => {
        const chart = { options: { devicePixelRatio: 1, animation: true as boolean | object }, resize: vi.fn(), update: vi.fn() };
        const win = { Chart: { instances: { a: chart } } } as unknown as Window;
        const restore = SharpenCharts(win);
        expect(chart.options).toEqual({ devicePixelRatio: 3, animation: false });
        expect(chart.update).toHaveBeenCalledWith('none');
        restore();
        expect(chart.options).toEqual({ devicePixelRatio: 1, animation: true });
        expect(chart.resize).toHaveBeenCalledTimes(2);
    });

    it('does nothing when the page has not loaded Chart.js', () => {
        expect(() => SharpenCharts({} as Window)()).not.toThrow();
    });
});
