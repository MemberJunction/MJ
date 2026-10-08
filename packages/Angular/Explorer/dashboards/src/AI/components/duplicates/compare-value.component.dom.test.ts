import { describe, it, expect, beforeEach } from 'vitest';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CompareValueComponent, LONG_VALUE_THRESHOLD } from './compare-value.component';

/**
 * DOM coverage for <mj-compare-value> — one value cell in the duplicate-record
 * comparison grid. The host mirrors how the grid uses it: the value sits inside
 * a clickable cell whose (click) selects that value for the merge, exactly like
 * `.grid-value-cell (click)="SelectFieldValue(...)"` in the dashboard.
 */

const LONG_URL = 'https://cdn.example.com/photos/' + 'a'.repeat(LONG_VALUE_THRESHOLD) + '.jpg';
const SHORT_VALUE = 'john@example.com';

@Component({
  standalone: true,
  imports: [CompareValueComponent],
  template: `<div class="cell" (click)="SelectCount = SelectCount + 1"><mj-compare-value [Value]="Value"></mj-compare-value></div>`,
})
class CellHostComponent {
  public Value: string | undefined = LONG_URL;
  public SelectCount = 0;
}

function render(value: string | undefined): ComponentFixture<CellHostComponent> {
  const fixture = TestBed.createComponent(CellHostComponent);
  fixture.componentInstance.Value = value;
  fixture.detectChanges();
  return fixture;
}

function el(fixture: ComponentFixture<CellHostComponent>, selector: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(selector);
}

describe('CompareValueComponent (DOM)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CellHostComponent] });
  });

  it('a long value starts collapsed, with a "Show more" toggle and the full text in the tooltip', () => {
    const f = render(LONG_URL);
    const textEl = el(f, '.compare-value-text');
    expect(textEl?.classList.contains('compare-value-collapsed')).toBe(true);
    expect(textEl?.getAttribute('title')).toBe(LONG_URL);
    const toggle = el(f, '.compare-value-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle?.textContent?.trim()).toBe('Show more');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking the toggle expands to the full text, and clicking again collapses it', () => {
    const f = render(LONG_URL);
    el(f, '.compare-value-toggle')?.click();
    f.detectChanges();

    const textEl = el(f, '.compare-value-text');
    expect(textEl?.classList.contains('compare-value-collapsed')).toBe(false);
    expect(textEl?.textContent).toBe(LONG_URL);
    expect(el(f, '.compare-value-toggle')?.textContent?.trim()).toBe('Show less');
    expect(el(f, '.compare-value-toggle')?.getAttribute('aria-expanded')).toBe('true');

    el(f, '.compare-value-toggle')?.click();
    f.detectChanges();
    expect(el(f, '.compare-value-text')?.classList.contains('compare-value-collapsed')).toBe(true);
    expect(el(f, '.compare-value-toggle')?.textContent?.trim()).toBe('Show more');
  });

  it('a short value renders unchanged with no toggle and no tooltip', () => {
    const f = render(SHORT_VALUE);
    const textEl = el(f, '.compare-value-text');
    expect(textEl?.textContent).toBe(SHORT_VALUE);
    expect(textEl?.classList.contains('compare-value-collapsed')).toBe(false);
    expect(textEl?.hasAttribute('title')).toBe(false);
    expect(el(f, '.compare-value-toggle')).toBeNull();
  });

  it('a value of exactly the threshold length is not treated as long', () => {
    const f = render('x'.repeat(LONG_VALUE_THRESHOLD));
    expect(el(f, '.compare-value-toggle')).toBeNull();
  });

  it('clicking a collapsed value still selects it for the merge (click reaches the cell)', () => {
    const f = render(LONG_URL);
    el(f, '.compare-value-text')?.click();
    f.detectChanges();
    expect(f.componentInstance.SelectCount).toBe(1);
    // ...and selecting does not expand it
    expect(el(f, '.compare-value-text')?.classList.contains('compare-value-collapsed')).toBe(true);
  });

  it('clicking the toggle does not select the value for the merge', () => {
    const f = render(LONG_URL);
    el(f, '.compare-value-toggle')?.click();
    f.detectChanges();
    expect(f.componentInstance.SelectCount).toBe(0);
  });

  it('a new value resets the view to collapsed', () => {
    const f = render(LONG_URL);
    el(f, '.compare-value-toggle')?.click();
    f.detectChanges();
    f.componentInstance.Value = LONG_URL + '?v=2';
    // Zoneless: a direct field write does not dirty the host view, so mark it before checking
    f.componentRef.changeDetectorRef.markForCheck();
    f.detectChanges();
    expect(el(f, '.compare-value-text')?.textContent).toBe(LONG_URL + '?v=2');
    expect(el(f, '.compare-value-text')?.classList.contains('compare-value-collapsed')).toBe(true);
  });
});
