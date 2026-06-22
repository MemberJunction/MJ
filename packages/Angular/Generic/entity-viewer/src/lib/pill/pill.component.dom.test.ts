import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, text, hasClass } from '@memberjunction/ng-test-utils';
import { PillComponent } from './pill.component';

/**
 * DOM coverage for PillComponent. Template:
 *   <span class="pill" [class]="'pill-' + effectiveColorType">{{ displayValue }}</span>
 * Verifies the rendered text ({{ displayValue }}) and the semantic color class
 * ([class]="'pill-' + effectiveColorType") for both auto-detected and forced colors.
 */
describe('PillComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown>) =>
    renderComponentFixture(PillComponent, {
      imports: [CommonModule],
      declarations: [PillComponent],
      inputs,
    });

  it('renders the value as the pill text', () => {
    const fixture = render({ value: 'Active' });
    expect(text(fixture, 'span.pill')).toBe('Active');
  });

  it('renders empty text when value is null', () => {
    const fixture = render({ value: null });
    expect(text(fixture, 'span.pill')).toBe('');
  });

  it('auto-detects a success color from a positive value', () => {
    const fixture = render({ value: 'Active' });
    expect(hasClass(fixture, 'span.pill', 'pill-success')).toBe(true);
  });

  it('auto-detects a danger color from a negative value', () => {
    const fixture = render({ value: 'Failed' });
    expect(hasClass(fixture, 'span.pill', 'pill-danger')).toBe(true);
  });

  it('falls back to neutral for an unrecognized value', () => {
    const fixture = render({ value: 'Whatever' });
    expect(hasClass(fixture, 'span.pill', 'pill-neutral')).toBe(true);
  });

  it('honors a forced color over auto-detection', () => {
    // value "Active" would auto-detect success, but the forced color wins
    const fixture = render({ value: 'Active', color: 'info' });
    expect(hasClass(fixture, 'span.pill', 'pill-info')).toBe(true);
    expect(hasClass(fixture, 'span.pill', 'pill-success')).toBe(false);
  });
});
