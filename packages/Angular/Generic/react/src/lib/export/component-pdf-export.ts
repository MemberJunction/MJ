/**
 * @fileoverview Whole-component PDF export for rendered React components.
 *
 * The host captures the component's root element as it is currently shown (filters, selections and
 * grid pages kept) and lays it onto A4 pages. Content the user would have to scroll to see is
 * included. The root is laid out at the page's printable width (portrait or landscape), so the PDF
 * is the same whatever the viewer's size, then a "print mode" grows it to its content's height and expands
 * only the elements that actually clip their content, because a blanket height:auto stylesheet breaks
 * charts that size themselves to their container. The host page around the root is never changed.
 * Everything is restored afterwards.
 *
 * Content rendered in portals (antd modals, drawers, dropdowns) lives outside the root and is not
 * part of the PDF.
 * @module @memberjunction/ng-react
 */

import { BuildImagePdf, PdfImagePage } from './image-pdf-writer';

/** Inline style properties print mode sets; each touched element gets its original style text back on exit. */
const PRINT_STYLE_PROPERTIES = ['position', 'top', 'left', 'width', 'height', 'max-height', 'overflow', 'overflow-x', 'overflow-y', 'contain', 'flex'] as const;

/** Upper bound on expand passes: each pass can make a new ancestor spill, so it runs to a fixed point. */
const MAX_EXPAND_PASSES = 12;

/** Chart.js re-renders at this pixel ratio for the capture, so canvases stay sharp next to text. */
const CAPTURE_CHART_PIXEL_RATIO = 3;

/** html-to-image renders the element at this pixel ratio. */
const CAPTURE_PIXEL_RATIO = 2;

/** Elements that never need expanding: their size is their drawing, not a scroll box. */
const NON_EXPANDING_TAGS = new Set(['CANVAS', 'svg', 'IMG', 'VIDEO', 'IFRAME']);

/**
 * Elements a page break never splits when they fit on a page: drawings, rows, form fields and text
 * blocks. Elements with no child elements count too, and so does any container shorter than
 * {@link SMALL_BLOCK_PAGE_SHARE} of a page (a KPI tile, a bar row).
 */
const ATOMIC_TAGS = new Set(['svg', 'CANVAS', 'IMG', 'VIDEO', 'TR', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'LI', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LABEL', 'PRE']);
const SMALL_BLOCK_PAGE_SHARE = 0.15;

/** A container cut with less than this share of a page above the cut moves whole (keeps a card's header with it). */
const ORPHAN_PAGE_SHARE = 0.15;

/** A container that fits a page moves whole when less than this share of a page would carry over past the cut. */
const WIDOW_PAGE_SHARE = 0.15;

/** A break within this share of a page below a table header row or heading moves above it (keep with next). */
const KEEP_WITH_NEXT_PAGE_SHARE = 0.1;

/** A table's lead-in (section title, search box, header row) through its first row stays together within this share of a page. */
const TABLE_LEAD_PAGE_SHARE = 0.35;

/** Tags whose element must stay on the same page as what follows it. */
const KEEP_WITH_NEXT_TAGS = new Set(['THEAD', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/** A break that would leave a page less full than this is not moved; the page is cut where it falls. */
const MIN_PAGE_FILL_SHARE = 0.1;

/**
 * Shrink-to-fit: when keeping a chart or block together leaves a page less than {@link SHRINK_WHEN_FILL_BELOW}
 * full, the page may hold up to this much more content, scaled down to fit the paper.
 */
const MAX_SHRINK_EXTRA_SHARE = 0.2;
const SHRINK_WHEN_FILL_BELOW = 0.8;

/** Content wider than the page layout is laid out at its own width, up to this many page widths. */
const MAX_LAYOUT_WIDTH_FACTOR = 2;

/** Widening rounds: each adds the overflow that remains once the card padding is accounted for. */
const MAX_WIDEN_ROUNDS = 4;

/** Marks controls (such as ExportableData's export buttons) that are left out of captures. */
const EXPORT_CONTROL_ATTRIBUTE = 'data-export-control';

/** A4 in millimetres, and the page margin. */
const A4_SHORT_MM = 210;
const A4_LONG_MM = 297;
const PAGE_MARGIN_MM = 10;

/** CSS pixels per millimetre (96 per inch): laying out at the page width prints CSS sizes at true size. */
const CSS_PX_PER_MM = 96 / 25.4;

/** The page orientations a PDF export offers. */
export type PdfOrientation = 'portrait' | 'landscape';

/** One horizontal band of the captured image, placed on its own page. */
export interface PdfPageSlice {
    /** First source row of the band, in captured-image pixels. */
    SourceY: number;
    /** Height of the band, in captured-image pixels. */
    SourceHeight: number;
    /** Height the band is drawn at on the page, in millimetres. */
    DrawHeightMM: number;
    /** Width the band is drawn at, in millimetres: the printable width, or less when the page is shrunk to fit. */
    DrawWidthMM: number;
    /** Left edge of the band on the page, in millimetres (a shrunk page is centred). */
    XMM: number;
}

/** The vertical extent of one element of the capture, in captured-image pixels from its top. */
export interface CaptureBlock {
    Top: number;
    Bottom: number;
    /** True for a drawing, row, field or text block that a page break must not split. */
    Atomic: boolean;
    /** True for a table header row or heading, which must stay on the page of what follows it. */
    KeepWithNext?: boolean;
}

/** How the captured image is laid out: page orientation, drawn width and one slice per page. */
export interface PdfPagePlan {
    Orientation: PdfOrientation;
    PageWidthMM: number;
    PageHeightMM: number;
    DrawWidthMM: number;
    Slices: PdfPageSlice[];
}

/** The subset of a Chart.js instance the capture touches. */
interface ChartInstanceLike {
    options: { devicePixelRatio?: number; animation?: boolean | object };
    resize(): void;
    update(mode?: string): void;
}

/** The Chart.js global, when the page has loaded it from the CDN. */
interface ChartGlobalLike {
    instances?: Record<string, ChartInstanceLike>;
}

type WindowWithChart = Window & { Chart?: ChartGlobalLike };

function pageSize(orientation: PdfOrientation): { WidthMM: number; HeightMM: number } {
    return orientation === 'portrait'
        ? { WidthMM: A4_SHORT_MM, HeightMM: A4_LONG_MM }
        : { WidthMM: A4_LONG_MM, HeightMM: A4_SHORT_MM };
}

/**
 * The width, in CSS pixels, the component is laid out at for a page: the printable width at 96 dpi
 * (718 portrait, 1047 landscape), so 14px text prints at about 10.5pt whatever the viewer's size.
 */
export function PageLayoutWidth(orientation: PdfOrientation): number {
    return Math.round((pageSize(orientation).WidthMM - 2 * PAGE_MARGIN_MM) * CSS_PX_PER_MM);
}

/**
 * Where a break inside `block` should go instead: its top, or `cut` when the block may be split
 * there. Atomic blocks are never split (when they fit a page); with `layoutRules` on, small
 * containers are kept together and containers are not left with only their first or last lines.
 */
function breakFor(block: CaptureBlock, cut: number, pageHeight: number, layoutRules: boolean): number {
    const height = block.Bottom - block.Top;
    if (height > pageHeight) {
        return cut; // too tall for any page: it has to split
    }
    if (block.Atomic) {
        return block.Top;
    }
    const small = height < pageHeight * SMALL_BLOCK_PAGE_SHARE;
    const orphanedStart = cut - block.Top < pageHeight * ORPHAN_PAGE_SHARE;
    const widowedEnd = block.Bottom - cut < pageHeight * WIDOW_PAGE_SHARE;
    return layoutRules && (small || orphanedStart || widowedEnd) ? block.Top : cut;
}

/** A header row or heading the cut falls just below: it moves to the next page with what follows it. */
function keptWithNext(block: CaptureBlock, cut: number, pageHeight: number): boolean {
    return !!block.KeepWithNext && block.Bottom <= cut && cut - block.Bottom < pageHeight * KEEP_WITH_NEXT_PAGE_SHARE;
}

/** The cut moved up until no block (and, with `layoutRules`, no header-row or heading rule) objects to it. */
function settleCut(limit: number, blocks: CaptureBlock[], pageHeight: number, layoutRules: boolean): number {
    let cut = limit;
    for (let moved = true; moved;) {
        moved = false;
        for (const block of blocks) {
            if (layoutRules && keptWithNext(block, cut, pageHeight) && block.Top < cut) {
                cut = block.Top;
                moved = true;
            } else if (block.Top < cut && cut < block.Bottom) {
                const next = breakFor(block, cut, pageHeight, layoutRules);
                if (next < cut) {
                    cut = next;
                    moved = true;
                }
            }
        }
    }
    return cut;
}

/**
 * The page break at or above `limit` for a page starting at `pageTop`. First with every rule (no
 * split rows or drawings, no stranded first or last lines, header rows and headings kept with what
 * follows); when that would leave the page nearly empty, with only the never-split rule; and when
 * even that would, the page is cut at `limit`.
 */
function pageBreak(pageTop: number, limit: number, blocks: CaptureBlock[], pageHeight: number): number {
    const minimumEnd = pageTop + pageHeight * MIN_PAGE_FILL_SHARE;
    for (const layoutRules of [true, false]) {
        const cut = settleCut(limit, blocks, pageHeight, layoutRules);
        if (cut >= minimumEnd) {
            // Whole pixels: element positions are fractional, and a page image must be a whole number of rows.
            return Math.floor(cut);
        }
    }
    return limit;
}

/**
 * Lays a captured image of `imageWidth` by `imageHeight` pixels onto A4 pages in the given
 * orientation: scaled to the page width inside the margins and cut into page-height bands. Each
 * cut moves up so it does not split a drawing, row or other small element in `blocks`, and does not
 * strand a card's first or last lines; a page left mostly empty by that may be shrunk to fit.
 */
export function PlanPdfPages(imageWidth: number, imageHeight: number, orientation: PdfOrientation = 'portrait', blocks: CaptureBlock[] = []): PdfPagePlan {
    const page = pageSize(orientation);
    const drawWidthMM = page.WidthMM - 2 * PAGE_MARGIN_MM;
    const mmPerPixel = drawWidthMM / Math.max(imageWidth, 1);
    const pageHeightPx = Math.max(1, Math.floor((page.HeightMM - 2 * PAGE_MARGIN_MM) / mmPerPixel));
    const slices: PdfPageSlice[] = [];
    for (let sourceY = 0; sourceY < imageHeight;) {
        const end = pageEnd(sourceY, imageHeight, blocks, pageHeightPx);
        slices.push(placeSlice(sourceY, end - sourceY, pageHeightPx, mmPerPixel, drawWidthMM));
        sourceY = end;
    }
    return { Orientation: orientation, PageWidthMM: page.WidthMM, PageHeightMM: page.HeightMM, DrawWidthMM: drawWidthMM, Slices: slices };
}

/**
 * Where the page starting at `pageTop` ends. When keeping a block together leaves the page less than
 * {@link SHRINK_WHEN_FILL_BELOW} full, a page up to {@link MAX_SHRINK_EXTRA_SHARE} taller is tried, and
 * kept when it holds meaningfully more: that page is then shrunk to fit (shrink-to-fit). A sliver
 * that would be alone on the last page is folded into this page the same way.
 */
function pageEnd(pageTop: number, imageHeight: number, blocks: CaptureBlock[], pageHeightPx: number): number {
    const limit = pageTop + pageHeightPx;
    if (limit >= imageHeight) {
        return imageHeight;
    }
    const normal = pageBreak(pageTop, limit, blocks, pageHeightPx);
    const tallerHeight = Math.floor(pageHeightPx * (1 + MAX_SHRINK_EXTRA_SHARE));
    // A last page holding only a sliver (a row or two) is folded into this one when a shrunk page reaches the end.
    if (imageHeight - normal < pageHeightPx * WIDOW_PAGE_SHARE && imageHeight - pageTop <= tallerHeight) {
        return imageHeight;
    }
    if (normal - pageTop >= pageHeightPx * SHRINK_WHEN_FILL_BELOW) {
        return normal;
    }
    const tallerLimit = pageTop + tallerHeight;
    const taller = tallerLimit >= imageHeight ? imageHeight : pageBreak(pageTop, tallerLimit, blocks, tallerHeight);
    return taller - normal > pageHeightPx * SHRINK_WHEN_FILL_BELOW * MAX_SHRINK_EXTRA_SHARE ? taller : normal;
}

/** A slice drawn at the page width, or scaled down and centred when it is taller than a page. */
function placeSlice(sourceY: number, sourceHeight: number, pageHeightPx: number, mmPerPixel: number, drawWidthMM: number): PdfPageSlice {
    const scale = Math.min(1, pageHeightPx / Math.max(sourceHeight, 1));
    const width = drawWidthMM * scale;
    return {
        SourceY: sourceY,
        SourceHeight: sourceHeight,
        DrawHeightMM: sourceHeight * mmPerPixel * scale,
        DrawWidthMM: width,
        XMM: PAGE_MARGIN_MM + (drawWidthMM - width) / 2,
    };
}

/** `<title>_<YYYY-MM-DD>.pdf`, with anything outside letters, digits, space, - and _ replaced by _. */
export function PdfFileName(title: string | null | undefined, now: Date = new Date()): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const base = (title || '').trim().replace(/[^A-Za-z0-9 _-]/g, '_') || 'component';
    return `${base}_${stamp}.pdf`;
}

/**
 * Records each element's inline style text the first time print mode touches it, and puts it back
 * exactly. Saving the whole text (not single properties) also restores shorthands such as `flex`,
 * which browsers split into longhands.
 */
class InlineStyleJournal {
    private readonly saved = new Map<HTMLElement, string>();

    Set(element: HTMLElement, property: (typeof PRINT_STYLE_PROPERTIES)[number], value: string): void {
        if (!this.saved.has(element)) {
            this.saved.set(element, element.style.cssText);
        }
        element.style.setProperty(property, value);
    }

    RestoreAll(): void {
        for (const [element, cssText] of this.saved) {
            element.style.cssText = cssText;
        }
        this.saved.clear();
    }
}

const CLIPPING_OVERFLOW = new Set(['auto', 'scroll', 'hidden', 'clip']);

/** True when the element's content is taller than the box it holds. */
function overflowsVertically(element: HTMLElement): boolean {
    return element.scrollHeight > element.clientHeight + 1;
}

/** True when the element hides vertical content behind a scrollbar or a clip. */
function clipsVertically(element: HTMLElement): boolean {
    return CLIPPING_OVERFLOW.has(getComputedStyle(element).overflowY) && overflowsVertically(element);
}

/**
 * True when the element is a sideways scroller hiding columns (a table too wide for the page).
 * Only scrolling containers count: `overflow: hidden` on purpose (an ellipsis cell) stays clipped.
 */
function scrollsHorizontally(element: HTMLElement): boolean {
    const overflowX = getComputedStyle(element).overflowX;
    return (overflowX === 'auto' || overflowX === 'scroll') && element.scrollWidth > element.clientWidth + 1;
}

/**
 * Shows a sideways scroller's full width, so no column is lost: the content then runs past the page
 * width and the capture is scaled down to fit. Also drops `contain`, which would keep it narrow.
 */
function releaseHorizontally(journal: InlineStyleJournal, element: HTMLElement): void {
    journal.Set(element, 'overflow-x', 'visible');
    journal.Set(element, 'contain', 'none');
}

/** True when the element's content now spills past a height the element still holds, without clipping it. */
function spillsOutOfFixedHeight(element: HTMLElement): boolean {
    return !CLIPPING_OVERFLOW.has(getComputedStyle(element).overflowY) && overflowsVertically(element);
}

/** True when the element sits in a top-to-bottom flex layout, where `flex: none` stops it being squeezed. */
function isInColumnFlex(element: HTMLElement): boolean {
    const parent = element.parentElement;
    if (!parent) {
        return false;
    }
    const style = getComputedStyle(parent);
    return style.display.includes('flex') && style.flexDirection.startsWith('column');
}

/**
 * Lets the element grow to its content's height. `flex: none` is applied only in a column flex
 * layout: in a row layout it would let the element widen to its content and rescale everything
 * that sizes itself to the width (an svg chart with `width: 100%`).
 */
function expandElement(journal: InlineStyleJournal, element: HTMLElement): void {
    journal.Set(element, 'height', 'auto');
    journal.Set(element, 'max-height', 'none');
    journal.Set(element, 'overflow-y', 'visible');
    if (isInColumnFlex(element)) {
        journal.Set(element, 'flex', 'none');
    }
}

/**
 * The root grows to its content's height at its current width. Its ancestors (the host's panes)
 * are left alone: the capture clones only the root, so their clipping does not matter, and
 * changing them reflows the host page around the component.
 */
function expandRoot(journal: InlineStyleJournal, root: HTMLElement): void {
    journal.Set(root, 'width', `${root.getBoundingClientRect().width}px`);
    journal.Set(root, 'height', 'auto');
    journal.Set(root, 'max-height', 'none');
    journal.Set(root, 'overflow', 'visible');
}

function isExpandable(element: HTMLElement): boolean {
    return !NON_EXPANDING_TAGS.has(element.tagName) && !element.closest('svg');
}

/** Ancestors (up to the root) that hold a fixed height the expanded element now spills out of. */
function expandSpillingAncestors(journal: InlineStyleJournal, element: HTMLElement, root: HTMLElement): void {
    for (let ancestor = element.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
        if (spillsOutOfFixedHeight(ancestor)) {
            expandElement(journal, ancestor);
        }
    }
}

/**
 * One pass over the root's elements; true when anything was expanded. Only elements that clip are
 * expanded, plus the ancestors they then spill out of: an element whose absolutely positioned
 * overlay pokes out (a chart legend, a tooltip) is left alone.
 */
function expandClippingPass(journal: InlineStyleJournal, root: HTMLElement): boolean {
    let changed = false;
    for (const element of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
        if (!isExpandable(element)) {
            continue;
        }
        if (clipsVertically(element)) {
            expandElement(journal, element);
            expandSpillingAncestors(journal, element, root);
            changed = true;
        }
        if (scrollsHorizontally(element)) {
            releaseHorizontally(journal, element);
            changed = true;
        }
    }
    return changed;
}

/**
 * Expands `root` (at its current width) and every element inside it that clips its content,
 * repeating until nothing changes. Returns a function that restores every inline style it touched.
 */
export function EnterPrintMode(root: HTMLElement): () => void {
    const journal = new InlineStyleJournal();
    expandRoot(journal, root);
    for (let pass = 0; pass < MAX_EXPAND_PASSES && expandClippingPass(journal, root); pass++) {
        // each pass can reveal a new clipping ancestor
    }
    return () => journal.RestoreAll();
}

/**
 * How far the widest content inside `root` runs past its container, in CSS pixels: a table wider
 * than its card overflows into the card's padding and border even when the root itself is not
 * wider. Elements that clip on purpose (`overflow: hidden`, an ellipsis cell) and svg internals
 * are ignored.
 */
export function HorizontalOverflow(root: HTMLElement): number {
    let widest = Math.max(0, root.scrollWidth - root.clientWidth);
    for (const element of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
        const style = getComputedStyle(element);
        if (element.closest('svg') || element.childElementCount === 0 || CLIPPING_OVERFLOW.has(style.overflowX || style.overflow)) {
            continue;
        }
        widest = Math.max(widest, element.scrollWidth - element.clientWidth);
    }
    return widest;
}

/**
 * Lays `root` out at `widthPx` (the page's printable width), whatever its container's width. The
 * root is taken out of the page's flow (absolutely positioned at its container's top left) so its
 * page width cannot widen the host's flex panes and reflow the page around it. Returns a function
 * that restores its inline style.
 */
export function PinLayoutWidth(root: HTMLElement, widthPx: number): () => void {
    const journal = new InlineStyleJournal();
    journal.Set(root, 'position', 'absolute');
    journal.Set(root, 'top', '0');
    journal.Set(root, 'left', '0');
    journal.Set(root, 'width', `${widthPx}px`);
    return () => journal.RestoreAll();
}

/**
 * Re-renders every Chart.js chart on the page at a capture pixel ratio with animation off, so
 * canvases are sharp and never caught mid-animation. Returns a function that restores them.
 */
export function SharpenCharts(win: Window = window): () => void {
    const instances = Object.values((win as WindowWithChart).Chart?.instances ?? {});
    const originals = instances.map(chart => ({ chart, ratio: chart.options.devicePixelRatio, animation: chart.options.animation }));
    for (const { chart } of originals) {
        chart.options.devicePixelRatio = CAPTURE_CHART_PIXEL_RATIO;
        chart.options.animation = false;
        chart.resize();
        chart.update('none');
    }
    return () => {
        for (const { chart, ratio, animation } of originals) {
            chart.options.devicePixelRatio = ratio;
            chart.options.animation = animation;
            chart.resize();
            chart.update('none');
        }
    };
}

/** Lets layout, ResizeObservers and Chart.js resizes settle after print mode changes sizes. */
async function settleLayout(): Promise<void> {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await new Promise<void>(resolve => setTimeout(resolve, 250));
}

/** Leaves export controls (ExportableData's buttons) out of the capture. */
function isCapturedNode(node: HTMLElement): boolean {
    return !(node.getAttribute && node.getAttribute(EXPORT_CONTROL_ATTRIBUTE) === 'true');
}

/** The nearest ancestor that scrolls (the viewer pane), whose visible box the cover hides. */
function scrollingAncestor(element: HTMLElement): HTMLElement | null {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
        if (CLIPPING_OVERFLOW.has(getComputedStyle(node).overflowY)) {
            return node;
        }
    }
    return null;
}

/**
 * Covers the component's on-screen area with a "Preparing PDF…" panel while it is laid out at page
 * width, so the user does not watch it reflow. The cover sits outside the root, so it is not captured.
 */
function showPreparingCover(root: HTMLElement): () => void {
    const box = (scrollingAncestor(root) ?? root).getBoundingClientRect();
    const cover = document.createElement('div');
    cover.setAttribute('role', 'status');
    cover.textContent = 'Preparing PDF…';
    Object.assign(cover.style, {
        position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
        zIndex: '10000', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--mj-bg-surface, #ffffff)', color: 'var(--mj-text-secondary, #555555)', fontSize: '14px',
    });
    document.body.appendChild(cover);
    return () => cover.remove();
}

/** The capture and where its elements sit, for choosing page breaks. */
interface CapturedComponent {
    Canvas: HTMLCanvasElement;
    Blocks: CaptureBlock[];
}

/**
 * Where every element of `root` sits vertically, in captured-image pixels. Svg internals are left out
 * (the svg itself counts), and so are export controls.
 */
/**
 * An svg's vertical extent including what it draws past its own box (ribbons or labels outside its
 * viewBox with `overflow: visible`), within its container, so a page break never cuts the drawing.
 */
function svgDrawingBox(svg: Element): { top: number; bottom: number } {
    const own = svg.getBoundingClientRect();
    // Overshoot is counted only within the svg's container: a chart drawing over the next card is the
    // chart's own defect, and counting it would weld that card to the chart.
    const container = svg.parentElement?.getBoundingClientRect() ?? own;
    let top = own.top;
    let bottom = own.bottom;
    for (const shape of Array.from(svg.querySelectorAll('*'))) {
        const box = shape.getBoundingClientRect();
        if (box.height > 0) {
            top = Math.min(top, box.top);
            bottom = Math.max(bottom, box.bottom);
        }
    }
    return { top: Math.max(top, container.top), bottom: Math.min(bottom, container.bottom) };
}

/**
 * A table's lead-in, kept on one page: from where its section starts (a card's title, subtitle and
 * search box) through its header row to its first data row. The section start is the highest
 * enclosing container that begins at most `maxLeadPx` above the table, so the lead-in never reaches
 * back to unrelated content. Null when the table has no visible data row.
 */
export function TableLeadBlock(table: HTMLTableElement, root: HTMLElement, maxLeadPx: number): { top: number; bottom: number } | null {
    const firstRow = Array.from(table.querySelectorAll('tbody tr')).find(row => row.getBoundingClientRect().height > 0);
    if (!firstRow) {
        return null;
    }
    const tableTop = table.getBoundingClientRect().top;
    let top = tableTop;
    for (let node = table.parentElement; node && node !== root; node = node.parentElement) {
        const box = node.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) {
            continue; // a box-less wrapper (`display: contents`, as the MJ runtime puts around each component)
        }
        if (tableTop - box.top > maxLeadPx) {
            break;
        }
        top = Math.min(top, box.top);
    }
    return { top, bottom: firstRow.getBoundingClientRect().bottom };
}

function captureBlocks(root: HTMLElement, scale: number, orientation: PdfOrientation): CaptureBlock[] {
    const top = root.getBoundingClientRect().top;
    const blocks: CaptureBlock[] = [];
    // A page is this many CSS pixels tall at the capture's width; a table's lead-in may span about a third of it.
    const page = pageSize(orientation);
    const pageHeightCss = root.scrollWidth * (page.HeightMM - 2 * PAGE_MARGIN_MM) / (page.WidthMM - 2 * PAGE_MARGIN_MM);
    for (const table of Array.from(root.querySelectorAll('table'))) {
        const lead = TableLeadBlock(table, root, pageHeightCss * TABLE_LEAD_PAGE_SHARE);
        if (lead) {
            blocks.push({ Top: (lead.top - top) * scale, Bottom: (lead.bottom - top) * scale, Atomic: true });
        }
    }
    for (const element of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
        if ((element.parentElement && element.parentElement.closest('svg')) || element.closest(`[${EXPORT_CONTROL_ATTRIBUTE}="true"]`)) {
            continue;
        }
        const box = element.tagName === 'svg' ? svgDrawingBox(element) : element.getBoundingClientRect();
        if (box.bottom > box.top) {
            const atomic = ATOMIC_TAGS.has(element.tagName) || element.childElementCount === 0;
            const keepWithNext = KEEP_WITH_NEXT_TAGS.has(element.tagName) || element.getAttribute('role') === 'heading';
            blocks.push({ Top: (box.top - top) * scale, Bottom: (box.bottom - top) * scale, Atomic: atomic, KeepWithNext: keepWithNext });
        }
    }
    return blocks;
}

type HtmlToImage = typeof import('html-to-image');

let htmlToImage: Promise<HtmlToImage> | null = null;

/**
 * Loads `html-to-image` the first time a PDF is captured. A dynamic import is correct here (MJ allows one
 * for a measured bundle-size deferral): this package is bundled into hosts that never export a PDF, such
 * as the realtime widget's call, and a static import puts the rasterizer (about 15 KB minified) on their
 * start-up path. Loaded here, the bundler keeps it in a chunk only an export downloads.
 */
function loadHtmlToImage(): Promise<HtmlToImage> {
    htmlToImage ??= import('html-to-image');
    return htmlToImage;
}

/**
 * Captures `root` laid out at the page width and fully expanded, as a canvas. The width is applied
 * first and allowed to settle (charts re-render on resize), then clipping elements are expanded.
 * Every style and chart is restored afterwards.
 */
async function captureAtPageWidth(root: HTMLElement, orientation: PdfOrientation): Promise<CapturedComponent> {
    const removeCover = showPreparingCover(root);
    const restoreCharts = SharpenCharts();
    const pageWidth = PageLayoutWidth(orientation);
    let restoreWidth = PinLayoutWidth(root, pageWidth);
    let exitPrintMode: (() => void) | null = null;
    try {
        await settleLayout();
        exitPrintMode = EnterPrintMode(root);
        await settleLayout();
        // A table that needs more than the page width (released from its scroller) would spill past its
        // card: lay the whole component out wider and let the page scale it down. Widen by the largest
        // overflow inside the component until no container's content is wider than the container.
        let layoutWidth = pageWidth;
        const maxWidth = pageWidth * MAX_LAYOUT_WIDTH_FACTOR;
        for (let round = 0, overflow = HorizontalOverflow(root); round < MAX_WIDEN_ROUNDS && overflow > 1 && layoutWidth < maxWidth; round++, overflow = HorizontalOverflow(root)) {
            layoutWidth = Math.min(Math.ceil(layoutWidth + overflow), maxWidth);
            exitPrintMode();
            restoreWidth();
            restoreWidth = PinLayoutWidth(root, layoutWidth);
            await settleLayout();
            exitPrintMode = EnterPrintMode(root);
            await settleLayout();
        }
        const width = root.scrollWidth;
        const { toCanvas } = await loadHtmlToImage();
        const canvas = await toCanvas(root, {
            pixelRatio: CAPTURE_PIXEL_RATIO,
            backgroundColor: '#ffffff',
            width,
            height: root.scrollHeight,
            filter: node => !(node instanceof HTMLElement) || isCapturedNode(node),
        });
        return { Canvas: canvas, Blocks: captureBlocks(root, canvas.width / Math.max(width, 1), orientation) };
    } finally {
        exitPrintMode?.();
        restoreWidth();
        restoreCharts();
        removeCover();
    }
}

/** Copies one band of the captured canvas into its own canvas, for one page. */
function sliceCanvas(source: HTMLCanvasElement, slice: PdfPageSlice): HTMLCanvasElement {
    const band = document.createElement('canvas');
    band.width = source.width;
    band.height = slice.SourceHeight;
    const context = band.getContext('2d');
    if (context) {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, band.width, band.height);
        context.drawImage(source, 0, slice.SourceY, source.width, slice.SourceHeight, 0, 0, source.width, slice.SourceHeight);
    }
    return band;
}

/** True when a band holds nothing but (near-)white pixels, such as trailing padding. */
function isBlankBand(band: HTMLCanvasElement): boolean {
    const context = band.getContext('2d');
    if (!context || band.width === 0 || band.height === 0) {
        return true;
    }
    const pixels = context.getImageData(0, 0, band.width, band.height).data;
    for (let i = 0; i < pixels.length; i += 4 * 7) { // every 7th pixel is plenty for page-sized content
        if (pixels[i] < 245 || pixels[i + 1] < 245 || pixels[i + 2] < 245) {
            return false;
        }
    }
    return true;
}

/** The JPEG file bytes of a canvas. */
function jpegBytes(canvas: HTMLCanvasElement): Uint8Array {
    const base64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1] ?? '';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/** Builds the PDF from the captured canvas, one page per slice. */
function buildPdf(captured: CapturedComponent, orientation: PdfOrientation): Uint8Array<ArrayBuffer> {
    const canvas = captured.Canvas;
    const plan = PlanPdfPages(canvas.width, canvas.height, orientation, captured.Blocks);
    const bands = plan.Slices.map(slice => ({ slice, band: sliceCanvas(canvas, slice) }));
    const printed = bands.filter(({ band }) => !isBlankBand(band));
    const pages: PdfImagePage[] = (printed.length > 0 ? printed : bands.slice(0, 1)).map(({ slice, band }) => ({
        Jpeg: jpegBytes(band),
        PixelWidth: band.width,
        PixelHeight: band.height,
        PageWidthMM: plan.PageWidthMM,
        PageHeightMM: plan.PageHeightMM,
        XMM: slice.XMM,
        YMM: PAGE_MARGIN_MM,
        DrawWidthMM: slice.DrawWidthMM,
        DrawHeightMM: slice.DrawHeightMM,
    }));
    return BuildImagePdf(pages);
}

/** Hands the file to the browser as a download. */
function downloadFile(bytes: Uint8Array<ArrayBuffer>, fileName: string): void {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Exports the rendered component under `root` as a PDF download named `<title>_<date>.pdf`:
 * everything the component shows, including content behind inner scrollbars, in its current state,
 * laid out at the page's printable width so the PDF is the same whatever the viewer's size.
 */
export async function ExportComponentToPDF(root: HTMLElement, title?: string | null, orientation: PdfOrientation = 'portrait'): Promise<void> {
    const captured = await captureAtPageWidth(root, orientation);
    downloadFile(buildPdf(captured, orientation), PdfFileName(title));
}
