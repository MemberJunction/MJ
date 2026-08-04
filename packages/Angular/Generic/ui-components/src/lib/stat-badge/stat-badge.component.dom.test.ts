import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJStatBadgeComponent } from './stat-badge.component';

/**
 * DOM-level spec for `<mj-stat-badge>`. This component is almost entirely
 * template gating (`@if (Count != null)`, `@if (Total != null)`, `@if (Icon)`,
 * `@if (Label)`) plus host-class variant getters — exactly the contract that
 * class-level tests cannot see. Every assertion here is on rendered DOM.
 */
describe('MJStatBadgeComponent (DOM)', () => {
  function render(
    setup?: (c: MJStatBadgeComponent) => void,
  ): ComponentFixture<MJStatBadgeComponent> {
    const fixture = TestBed.createComponent(MJStatBadgeComponent);
    setup?.(fixture.componentInstance);
    fixture.detectChanges();
    return fixture;
  }

  it('renders just the count when Count is set and Total is not', () => {
    const el = render((c) => {
      c.Count = 42;
      c.Label = 'integrations';
    }).nativeElement as HTMLElement;

    const strongs = el.querySelectorAll('strong');
    expect(strongs.length).toBe(1);
    expect(strongs[0].textContent?.trim()).toBe('42');
    expect(el.querySelector('.mj-stat-badge-of')).toBeNull();
    expect(el.querySelector('.mj-stat-badge-label')?.textContent?.trim()).toBe('integrations');
  });

  it('renders the "X of Y" shape when Total is also set', () => {
    const el = render((c) => {
      c.Count = 12;
      c.Total = 50;
      c.Label = 'prompts';
    }).nativeElement as HTMLElement;

    const strongs = el.querySelectorAll('strong');
    expect(strongs.length).toBe(2);
    expect(strongs[0].textContent?.trim()).toBe('12');
    expect(strongs[1].textContent?.trim()).toBe('50');
    expect(el.querySelector('.mj-stat-badge-of')?.textContent?.trim()).toBe('of');
  });

  it('renders an icon element only when Icon is provided', () => {
    const withoutIcon = render((c) => (c.Label = 'x')).nativeElement as HTMLElement;
    expect(withoutIcon.querySelector('i')).toBeNull();

    const withIcon = render((c) => {
      c.Icon = 'fa-solid fa-spinner';
      c.Label = 'running';
    }).nativeElement as HTMLElement;
    const icon = withIcon.querySelector('i');
    expect(icon).not.toBeNull();
    expect(icon?.className).toContain('fa-spinner');
  });

  it('applies the variant host class so styling reflects the Variant input', () => {
    const host = render((c) => {
      c.Count = 3;
      c.Variant = 'error';
    }).nativeElement as HTMLElement;

    expect(host.classList.contains('mj-stat-badge--error')).toBe(true);
    expect(host.classList.contains('mj-stat-badge--success')).toBe(false);
  });
});
