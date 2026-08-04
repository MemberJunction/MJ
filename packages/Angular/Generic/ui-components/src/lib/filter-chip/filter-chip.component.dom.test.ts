import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { MJFilterChipComponent } from './filter-chip.component';

/** DOM-level spec for <mj-filter-chip> — label/icon/count rendering, active state, click output. */
describe('MJFilterChipComponent (DOM)', () => {
  const buttonOf = (f: ComponentFixture<MJFilterChipComponent>) =>
    f.nativeElement.querySelector('button.mj-filter-chip') as HTMLButtonElement;

  it('renders the Label text', () => {
    const f = renderComponentFixture(MJFilterChipComponent, { inputs: { Label: 'Failed' } });
    expect(buttonOf(f).querySelector('span')?.textContent?.trim()).toBe('Failed');
  });

  it('is not active by default (no active class, aria-pressed=false)', () => {
    const btn = buttonOf(renderComponentFixture(MJFilterChipComponent));
    expect(btn.classList.contains('mj-filter-chip--active')).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('applies the active class and aria-pressed=true when Active is set', () => {
    const btn = buttonOf(renderComponentFixture(MJFilterChipComponent, { inputs: { Active: true } }));
    expect(btn.classList.contains('mj-filter-chip--active')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders an icon when Icon is set', () => {
    const f = renderComponentFixture(MJFilterChipComponent, { inputs: { Icon: 'fa-solid fa-times-circle' } });
    expect(buttonOf(f).querySelector('i')).not.toBeNull();
  });

  it('renders the count when Count is set, and none when it is null', () => {
    const withCount = renderComponentFixture(MJFilterChipComponent, { inputs: { Count: 5 } });
    expect(buttonOf(withCount).querySelector('.mj-filter-chip-count')?.textContent).toContain('5');

    const noCount = renderComponentFixture(MJFilterChipComponent);
    expect(buttonOf(noCount).querySelector('.mj-filter-chip-count')).toBeNull();
  });

  it('emits Clicked when the chip is clicked', () => {
    const spy = vi.fn();
    const f = renderComponentFixture(MJFilterChipComponent, { setup: (c) => c.Clicked.subscribe(spy) });
    buttonOf(f).click();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
