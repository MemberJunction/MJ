import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CompareValueComponent, COLLAPSED_LINES, LONG_VALUE_THRESHOLD } from './compare-value.component';

/**
 * DOM coverage for <mj-compare-value> — one value cell in the duplicate-record
 * comparison grid. The host mirrors how the grid uses it: the value sits inside
 * a clickable cell whose (click) selects that value for the merge, exactly like
 * `.grid-value-cell (click)="SelectFieldValue(...)"` in the dashboard.
 *
 * jsdom does no layout, so the text span's heights are stubbed: `layout.fullHeight`
 * is how tall the whole value renders at the column's current width, and a
 * collapsed span reports a client height of at most two lines. ResizeObserver is
 * faked so a test can "resize the column" by changing the layout and firing it.
 */

const LONG_URL = 'https://cdn.example.com/photos/' + 'a'.repeat(LONG_VALUE_THRESHOLD) + '.jpg';
const SHORT_VALUE = 'john@example.com';

const LINE_HEIGHT = 18;
/** Full rendered height of a value that needs four lines at the current width. */
const FOUR_LINES = LINE_HEIGHT * 4;
/** Full rendered height of a value that fits in the two collapsed lines. */
const TWO_LINES = LINE_HEIGHT * COLLAPSED_LINES;

const layout = { fullHeight: FOUR_LINES };
let resizeCallbacks: Array<() => void> = [];

class FakeResizeObserver {
  constructor(private callback: () => void) {
    resizeCallbacks.push(callback);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    resizeCallbacks = resizeCallbacks.filter(cb => cb !== this.callback);
  }
}

function isText(node: HTMLElement): boolean {
  return node.classList?.contains('compare-value-text') ?? false;
}

beforeEach(() => {
  layout.fullHeight = FOUR_LINES;
  resizeCallbacks = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return isText(this) ? layout.fullHeight : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    if (!isText(this)) return 0;
    return this.classList.contains('compare-value-collapsed') ? Math.min(layout.fullHeight, TWO_LINES) : layout.fullHeight;
  });
  const realGetComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((node: Element, pseudo?: string | null) =>
    isText(node as HTMLElement) ? ({ lineHeight: `${LINE_HEIGHT}px` } as CSSStyleDeclaration) : realGetComputedStyle(node, pseudo),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Let the post-render measurement run and re-render with its result. */
async function settle<T>(fixture: ComponentFixture<T>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

/** Simulate a column resize: the value now renders `fullHeight` tall, and the observer fires. */
async function resizeTo<T>(fixture: ComponentFixture<T>, fullHeight: number): Promise<void> {
  layout.fullHeight = fullHeight;
  resizeCallbacks.forEach(cb => cb());
  await settle(fixture);
}

@Component({
  standalone: true,
  imports: [CompareValueComponent],
  template: `<div class="cell" (click)="SelectCount = SelectCount + 1"><mj-compare-value [Value]="Value"></mj-compare-value></div>`,
})
class CellHostComponent {
  public Value: string | undefined = LONG_URL;
  public SelectCount = 0;
}

async function render(value: string | undefined): Promise<ComponentFixture<CellHostComponent>> {
  const fixture = TestBed.createComponent(CellHostComponent);
  fixture.componentInstance.Value = value;
  await settle(fixture);
  return fixture;
}

function el(fixture: ComponentFixture<unknown>, selector: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(selector);
}

async function clickToggle(fixture: ComponentFixture<unknown>, selector = '.compare-value-toggle'): Promise<void> {
  el(fixture, selector)?.click();
  await settle(fixture);
}

describe('CompareValueComponent (DOM)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CellHostComponent] });
  });

  it('a long value that overflows two lines starts collapsed, with a "Show more" toggle and the full text in the tooltip', async () => {
    const f = await render(LONG_URL);
    const textEl = el(f, '.compare-value-text');
    expect(textEl?.classList.contains('compare-value-collapsed')).toBe(true);
    expect(textEl?.getAttribute('title')).toBe(LONG_URL);
    const toggle = el(f, '.compare-value-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle?.textContent?.trim()).toBe('Show more');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
  });

  it('a long value that fits in two lines at the column width gets no toggle and no tooltip', async () => {
    layout.fullHeight = TWO_LINES;
    const f = await render(LONG_URL);
    expect(el(f, '.compare-value-toggle')).toBeNull();
    expect(el(f, '.compare-value-text')?.hasAttribute('title')).toBe(false);
    expect(el(f, '.compare-value-text')?.textContent).toBe(LONG_URL);
  });

  it('clicking the toggle expands to the full text without a tooltip, and clicking again collapses it', async () => {
    const f = await render(LONG_URL);
    await clickToggle(f);

    const textEl = el(f, '.compare-value-text');
    expect(textEl?.classList.contains('compare-value-collapsed')).toBe(false);
    expect(textEl?.textContent).toBe(LONG_URL);
    expect(textEl?.hasAttribute('title')).toBe(false);
    expect(el(f, '.compare-value-toggle')?.textContent?.trim()).toBe('Show less');
    expect(el(f, '.compare-value-toggle')?.getAttribute('aria-expanded')).toBe('true');

    await clickToggle(f);
    expect(el(f, '.compare-value-text')?.classList.contains('compare-value-collapsed')).toBe(true);
    expect(el(f, '.compare-value-text')?.getAttribute('title')).toBe(LONG_URL);
    expect(el(f, '.compare-value-toggle')?.textContent?.trim()).toBe('Show more');
  });

  it('resizing the column re-checks the overflow: the toggle appears when the value stops fitting and goes when it fits again', async () => {
    layout.fullHeight = TWO_LINES;
    const f = await render(LONG_URL);
    expect(el(f, '.compare-value-toggle')).toBeNull();

    await resizeTo(f, FOUR_LINES);
    expect(el(f, '.compare-value-toggle')?.textContent?.trim()).toBe('Show more');
    expect(el(f, '.compare-value-text')?.getAttribute('title')).toBe(LONG_URL);

    await resizeTo(f, TWO_LINES);
    expect(el(f, '.compare-value-toggle')).toBeNull();
    expect(el(f, '.compare-value-text')?.hasAttribute('title')).toBe(false);
  });

  it('an expanded value keeps "Show less" while it is taller than two lines, and loses it when a resize makes it fit', async () => {
    const f = await render(LONG_URL);
    await clickToggle(f);
    await resizeTo(f, FOUR_LINES);
    expect(el(f, '.compare-value-toggle')?.textContent?.trim()).toBe('Show less');

    await resizeTo(f, TWO_LINES);
    expect(el(f, '.compare-value-toggle')).toBeNull();
  });

  it('a short value renders unchanged with no toggle and no tooltip, even in a narrow column', async () => {
    const f = await render(SHORT_VALUE);
    const textEl = el(f, '.compare-value-text');
    expect(textEl?.textContent).toBe(SHORT_VALUE);
    expect(textEl?.classList.contains('compare-value-collapsed')).toBe(false);
    expect(textEl?.hasAttribute('title')).toBe(false);
    expect(el(f, '.compare-value-toggle')).toBeNull();
  });

  it('a value of exactly the threshold length is not treated as long', async () => {
    const f = await render('x'.repeat(LONG_VALUE_THRESHOLD));
    expect(el(f, '.compare-value-text')?.classList.contains('compare-value-collapsed')).toBe(false);
    expect(el(f, '.compare-value-toggle')).toBeNull();
  });

  it('clicking a collapsed value still selects it for the merge (click reaches the cell)', async () => {
    const f = await render(LONG_URL);
    el(f, '.compare-value-text')?.click();
    await settle(f);
    expect(f.componentInstance.SelectCount).toBe(1);
    // ...and selecting does not expand it
    expect(el(f, '.compare-value-text')?.classList.contains('compare-value-collapsed')).toBe(true);
  });

  it('clicking the toggle does not select the value for the merge', async () => {
    const f = await render(LONG_URL);
    await clickToggle(f);
    expect(f.componentInstance.SelectCount).toBe(0);
  });

  it('a new value resets the view to collapsed and re-checks its overflow', async () => {
    const f = await render(LONG_URL);
    await clickToggle(f);
    layout.fullHeight = TWO_LINES;
    f.componentInstance.Value = LONG_URL + '?v=2';
    // Zoneless: a direct field write does not dirty the host view, so mark it before checking
    f.componentRef.changeDetectorRef.markForCheck();
    await settle(f);
    expect(el(f, '.compare-value-text')?.textContent).toBe(LONG_URL + '?v=2');
    expect(el(f, '.compare-value-text')?.classList.contains('compare-value-collapsed')).toBe(true);
    expect(el(f, '.compare-value-toggle')).toBeNull();
  });
});

/** Host mirroring one grid ROW: a source value and a match value sharing the row's expanded state. */
@Component({
  standalone: true,
  imports: [CompareValueComponent],
  template: `
    <div class="source"><mj-compare-value [Value]="Source" [Expanded]="Expanded" (ExpandedChange)="Expanded = $event"></mj-compare-value></div>
    <div class="match"><mj-compare-value [Value]="Match" [Expanded]="Expanded" (ExpandedChange)="Expanded = $event"></mj-compare-value></div>`,
})
class RowHostComponent {
  public Source = LONG_URL;
  public Match = LONG_URL + '?v=2';
  public Expanded = false;
}

describe('CompareValueComponent (DOM) — one row expands together', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RowHostComponent] });
  });

  const collapsed = (root: HTMLElement, cell: string): boolean | undefined =>
    root.querySelector(`.${cell} .compare-value-text`)?.classList.contains('compare-value-collapsed');

  it('expanding one column expands the other values in the same row, and collapsing closes them all', async () => {
    const f = TestBed.createComponent(RowHostComponent);
    await settle(f);
    const root = f.nativeElement as HTMLElement;
    expect(collapsed(root, 'source')).toBe(true);
    expect(collapsed(root, 'match')).toBe(true);

    await clickToggle(f, '.match .compare-value-toggle');
    expect(f.componentInstance.Expanded).toBe(true);
    expect(collapsed(root, 'source')).toBe(false);
    expect(collapsed(root, 'match')).toBe(false);

    await clickToggle(f, '.source .compare-value-toggle');
    expect(f.componentInstance.Expanded).toBe(false);
    expect(collapsed(root, 'source')).toBe(true);
    expect(collapsed(root, 'match')).toBe(true);
  });
});
