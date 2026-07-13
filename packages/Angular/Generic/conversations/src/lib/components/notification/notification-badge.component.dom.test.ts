import { describe, it, expect } from 'vitest';
import { of } from 'rxjs';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { NotificationBadgeComponent } from './notification-badge.component';
import { NotificationService } from '../../services/notification.service';
import type { BadgeConfig } from '../../models/notification.model';

/**
 * DOM spec for <mj-notification-badge>. The component injects NotificationService
 * (only used to lazily load config when none is passed), but the template renders
 * straight off the badgeConfig @Input — so a stub service satisfies DI while the
 * input drives every branch. Covers show-gating, the four badge-type branches, the
 * count > 0 requirement, the priority/animate modifier classes, and the 99+ format.
 */
describe('NotificationBadgeComponent (DOM)', () => {
  const render = (badgeConfig?: BadgeConfig) =>
    renderComponentFixture(NotificationBadgeComponent, {
      declarations: [NotificationBadgeComponent],
      providers: [{ provide: NotificationService, useValue: { getBadgeConfig$: () => of(null) } }],
      inputs: { badgeConfig },
    });

  it('renders nothing when there is no config', () => {
    expect(query(render(undefined), '.notification-badge-container')).toBeNull();
  });

  it('renders nothing when config.show is false', () => {
    expect(query(render({ show: false, type: 'count', count: 3 }), '.notification-badge-container')).toBeNull();
  });

  it('renders a count badge with the count when type is count and count > 0', () => {
    const f = render({ show: true, type: 'count', count: 3 });
    expect(query(f, '.badge-count')).not.toBeNull();
    expect(text(f, '.badge-count')).toContain('3');
  });

  it('does not render a count badge when the count is zero', () => {
    const f = render({ show: true, type: 'count', count: 0 });
    expect(query(f, '.badge-count')).toBeNull();
  });

  it('formats counts over 99 as "99+"', () => {
    const f = render({ show: true, type: 'count', count: 150 });
    expect(text(f, '.badge-count')).toContain('99+');
  });

  it('renders a dot badge for type "dot"', () => {
    const f = render({ show: true, type: 'dot' });
    expect(query(f, '.badge-dot')).not.toBeNull();
  });

  it('renders a pulse badge with rings for type "pulse"', () => {
    const f = render({ show: true, type: 'pulse', count: 2 });
    expect(query(f, '.badge-pulse')).not.toBeNull();
    expect(query(f, '.pulse-ring')).not.toBeNull();
    expect(text(f, '.pulse-count')).toContain('2');
  });

  it('renders a "NEW" badge for type "new"', () => {
    const f = render({ show: true, type: 'new' });
    expect(text(f, '.badge-new')).toContain('NEW');
  });

  it('applies the high-priority modifier class', () => {
    const f = render({ show: true, type: 'count', count: 1, priority: 'high' });
    expect(query(f, '.badge-count')?.classList.contains('badge-high')).toBe(true);
  });

  it('applies the urgent-priority modifier class', () => {
    const f = render({ show: true, type: 'count', count: 1, priority: 'urgent' });
    expect(query(f, '.badge-count')?.classList.contains('badge-urgent')).toBe(true);
  });

  it('applies the animate modifier class when animate is set', () => {
    const f = render({ show: true, type: 'count', count: 1, animate: true });
    expect(query(f, '.badge-count')?.classList.contains('badge-animate')).toBe(true);
  });
});
