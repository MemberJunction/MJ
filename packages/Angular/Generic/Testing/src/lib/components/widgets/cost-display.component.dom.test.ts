import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text, hasClass } from '@memberjunction/ng-test-utils';
import { CostDisplayComponent } from './cost-display.component';

// Module-declared leaf. Template: .cost-display with [class]=getMagnitudeClass(),
// @if(showIcon) a $-sign <i>, {{ formatCost(cost) }}, and @if(label) a label span.
describe('CostDisplayComponent (DOM)', () => {
  it('formats a sub-cent cost with the default 6 decimals', () => {
    const fixture = renderComponentFixture(CostDisplayComponent, {
      declarations: [CostDisplayComponent],
      inputs: { cost: 0.000123 },
    });
    expect(text(fixture, '.cost-value')).toBe('$0.000123');
  });

  it('formats a mid-range cost with 4 decimals', () => {
    const fixture = renderComponentFixture(CostDisplayComponent, {
      declarations: [CostDisplayComponent],
      inputs: { cost: 0.5 },
    });
    expect(text(fixture, '.cost-value')).toBe('$0.5000');
  });

  it('formats a dollar-plus cost with 2 decimals', () => {
    const fixture = renderComponentFixture(CostDisplayComponent, {
      declarations: [CostDisplayComponent],
      inputs: { cost: 12.5 },
    });
    expect(text(fixture, '.cost-value')).toBe('$12.50');
  });

  it('formats thousands with the K suffix', () => {
    const fixture = renderComponentFixture(CostDisplayComponent, {
      declarations: [CostDisplayComponent],
      inputs: { cost: 2500 },
    });
    expect(text(fixture, '.cost-value')).toBe('$2.50K');
  });

  it('applies the low magnitude class below the low threshold', () => {
    const fixture = renderComponentFixture(CostDisplayComponent, {
      declarations: [CostDisplayComponent],
      inputs: { cost: 0.001 },
    });
    expect(hasClass(fixture, '.cost-display', 'cost-display--low')).toBe(true);
  });

  it('applies the high magnitude class at/above the high threshold', () => {
    const fixture = renderComponentFixture(CostDisplayComponent, {
      declarations: [CostDisplayComponent],
      inputs: { cost: 5 },
    });
    expect(hasClass(fixture, '.cost-display', 'cost-display--high')).toBe(true);
  });

  it('renders an optional label when provided', () => {
    const fixture = renderComponentFixture(CostDisplayComponent, {
      declarations: [CostDisplayComponent],
      inputs: { cost: 1, label: 'per run' },
    });
    expect(text(fixture, '.cost-label')).toBe('per run');
  });

  it('omits the label element when no label is set', () => {
    const fixture = renderComponentFixture(CostDisplayComponent, {
      declarations: [CostDisplayComponent],
      inputs: { cost: 1 },
    });
    expect(query(fixture, '.cost-label')).toBeNull();
  });

  it('hides the dollar icon when showIcon is false', () => {
    const fixture = renderComponentFixture(CostDisplayComponent, {
      declarations: [CostDisplayComponent],
      inputs: { cost: 1, showIcon: false },
    });
    expect(query(fixture, '.cost-icon')).toBeNull();
  });
});
