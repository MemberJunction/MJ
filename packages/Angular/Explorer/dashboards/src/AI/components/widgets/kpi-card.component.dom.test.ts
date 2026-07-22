import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { KPICardComponent, KPICardData } from './kpi-card.component';

/**
 * DOM coverage for <app-kpi-card> (module-declared, standalone:false) — a pure-display metric card.
 * The header (icon + title + color modifier class) always renders; the content region gates the
 * value / subtitle / trend behind `!data.loading`, and swaps in an <mj-loading> spinner while loading.
 * `formatValue` compacts large numbers (K/M suffixes). No DI/async — a single synchronous render.
 *
 * <mj-loading> is stubbed (lightweight standalone) so we don't drag in ng-shared-generic; we only
 * assert its presence/absence, not its internals.
 */

@Component({ standalone: true, selector: 'mj-loading', template: '<span class="mj-loading-stub"></span>' })
class LoadingStub {
  @Input() showText = true;
  @Input() size = 'medium';
}

const data = (over: Partial<KPICardData> = {}): KPICardData => ({
  title: 'Total Runs',
  value: 1234,
  icon: 'fa-rocket',
  color: 'primary',
  ...over,
});

const render = (d: KPICardData) =>
  renderComponentFixture(KPICardComponent, {
    imports: [LoadingStub],
    declarations: [KPICardComponent],
    inputs: { data: d },
  });

describe('KPICardComponent (DOM)', () => {
  it('renders the title, the color-modifier class, and the icon', () => {
    const fixture = render(data());
    expect(text(fixture, '.kpi-card__title')).toBe('Total Runs');
    expect(query(fixture, '.kpi-card--primary')).not.toBeNull();
    expect(query(fixture, '.kpi-card__icon i')?.className).toContain('fa-rocket');
  });

  it('formats thousands with a K suffix', () => {
    expect(text(render(data({ value: 12500 })), '.kpi-card__value')).toBe('12.5K');
  });

  it('formats millions with an M suffix', () => {
    expect(text(render(data({ value: 3_400_000 })), '.kpi-card__value')).toBe('3.4M');
  });

  it('shows the value (not the spinner) when not loading', () => {
    const fixture = render(data({ loading: false }));
    expect(query(fixture, '.kpi-card__value')).not.toBeNull();
    expect(query(fixture, 'mj-loading')).toBeNull();
  });

  it('shows the spinner (not the value) while loading', () => {
    const fixture = render(data({ loading: true, subtitle: 'hidden', trend: { direction: 'up', percentage: 5, period: 'wk' } }));
    expect(query(fixture, '.kpi-card__loading mj-loading')).not.toBeNull();
    expect(query(fixture, '.kpi-card__value')).toBeNull();
    expect(query(fixture, '.kpi-card__subtitle')).toBeNull();
    expect(query(fixture, '.kpi-card__trend')).toBeNull();
  });

  it('renders the subtitle when present and not loading', () => {
    expect(text(render(data({ subtitle: 'Last 30 days' })), '.kpi-card__subtitle')).toBe('Last 30 days');
  });

  it('omits the subtitle block when none is supplied', () => {
    expect(query(render(data()), '.kpi-card__subtitle')).toBeNull();
  });

  it('renders the trend percentage and period with a direction icon', () => {
    const fixture = render(data({ trend: { direction: 'up', percentage: 8, period: 'this week' } }));
    expect(text(fixture, '.trend-percentage')).toContain('8%');
    expect(text(fixture, '.trend-period')).toBe('this week');
    expect(query(fixture, '.kpi-card__trend i')?.className).toContain('fa-arrow-up');
  });

  it('omits the trend block entirely when no trend data is supplied', () => {
    expect(query(render(data()), '.kpi-card__trend')).toBeNull();
  });
});
