import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text, hasClass } from '@memberjunction/ng-test-utils';
import { TestStatusBadgeComponent } from './test-status-badge.component';

// Module-declared (standalone: false) leaf — configured purely via @Input.
// Template: a single .test-status-badge span with per-status [class.x] flags,
// an @if(showIcon) <i> with getIcon()'s class, and {{ status }} text.
describe('TestStatusBadgeComponent (DOM)', () => {
  it('renders the status text', () => {
    const fixture = renderComponentFixture(TestStatusBadgeComponent, {
      declarations: [TestStatusBadgeComponent],
      inputs: { status: 'Passed' },
    });
    expect(text(fixture, '.badge-text')).toBe('Passed');
  });

  it('applies the status-specific modifier class', () => {
    const fixture = renderComponentFixture(TestStatusBadgeComponent, {
      declarations: [TestStatusBadgeComponent],
      inputs: { status: 'Failed' },
    });
    expect(hasClass(fixture, '.test-status-badge', 'test-status-badge--failed')).toBe(true);
    expect(hasClass(fixture, '.test-status-badge', 'test-status-badge--passed')).toBe(false);
  });

  it('renders the icon with the status-mapped class when showIcon is true (default)', () => {
    const fixture = renderComponentFixture(TestStatusBadgeComponent, {
      declarations: [TestStatusBadgeComponent],
      inputs: { status: 'Running' },
    });
    const icon = query(fixture, '.test-status-badge i');
    expect(icon).not.toBeNull();
    // getIcon() for 'Running' returns the spinner classes
    expect(icon!.className).toContain('fa-spinner');
  });

  it('hides the icon when showIcon is false but still shows text', () => {
    const fixture = renderComponentFixture(TestStatusBadgeComponent, {
      declarations: [TestStatusBadgeComponent],
      inputs: { status: 'Skipped', showIcon: false },
    });
    expect(query(fixture, '.test-status-badge i')).toBeNull();
    expect(text(fixture, '.badge-text')).toBe('Skipped');
  });

  it('maps the Timeout status to the timeout modifier and stopwatch icon', () => {
    const fixture = renderComponentFixture(TestStatusBadgeComponent, {
      declarations: [TestStatusBadgeComponent],
      inputs: { status: 'Timeout' },
    });
    expect(hasClass(fixture, '.test-status-badge', 'test-status-badge--timeout')).toBe(true);
    expect(query(fixture, '.test-status-badge i')!.className).toContain('fa-stopwatch');
  });

  // it.each → one TestBed per case (renderComponentFixture reconfigures the module, which can
  // only happen once per test). Covers the remaining status → modifier-class mappings.
  it.each([
    ['Skipped', 'test-status-badge--skipped'],
    ['Error', 'test-status-badge--error'],
    ['Running', 'test-status-badge--running'],
    ['Pending', 'test-status-badge--pending'],
  ])('maps the %s status to its modifier class', (status, cls) => {
    const fixture = renderComponentFixture(TestStatusBadgeComponent, {
      declarations: [TestStatusBadgeComponent],
      inputs: { status },
    });
    expect(hasClass(fixture, '.test-status-badge', cls)).toBe(true);
  });
});
