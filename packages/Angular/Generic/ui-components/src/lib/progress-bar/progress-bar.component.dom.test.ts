import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJProgressBarComponent } from './progress-bar.component';

/**
 * DOM-level spec for `<mj-progress-bar>`. Exercises the `@if (Type === ...)`
 * template branch (the value `<progress>` element vs. the infinite bar) and the
 * `ClampedValue` getter as it appears in the rendered `value` / `aria-valuenow`
 * attributes — behavior that only manifests once the template is rendered.
 */
describe('MJProgressBarComponent (DOM)', () => {
  function render(
    setup?: (c: MJProgressBarComponent) => void,
  ): ComponentFixture<MJProgressBarComponent> {
    const fixture = TestBed.createComponent(MJProgressBarComponent);
    setup?.(fixture.componentInstance);
    fixture.detectChanges();
    return fixture;
  }

  it('renders a <progress> element in the default (value) mode', () => {
    const fixture = render((c) => (c.Value = 40));
    const el = fixture.nativeElement as HTMLElement;

    const progress = el.querySelector('progress.mj-progress-bar');
    expect(progress).not.toBeNull();
    expect(el.querySelector('.mj-progress-bar--infinite')).toBeNull();
    expect(progress?.getAttribute('value')).toBe('40');
    expect(progress?.getAttribute('aria-valuenow')).toBe('40');
  });

  it('clamps the rendered value to the 0–100 range', () => {
    const over = render((c) => (c.Value = 150));
    expect(over.nativeElement.querySelector('progress')?.getAttribute('value')).toBe('100');

    const under = render((c) => (c.Value = -25));
    expect(under.nativeElement.querySelector('progress')?.getAttribute('value')).toBe('0');
  });

  it('switches to the indeterminate bar (no <progress>) when Type is infinite', () => {
    const fixture = render((c) => (c.Type = 'infinite'));
    const el = fixture.nativeElement as HTMLElement;

    const infinite = el.querySelector('.mj-progress-bar--infinite');
    expect(infinite).not.toBeNull();
    expect(infinite?.getAttribute('role')).toBe('progressbar');
    expect(el.querySelector('progress')).toBeNull();
    expect(el.querySelector('.mj-progress-bar-indeterminate')).not.toBeNull();
  });
});
