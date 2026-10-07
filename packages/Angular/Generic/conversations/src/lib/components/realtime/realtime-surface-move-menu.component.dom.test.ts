import { describe, it, expect, afterEach } from 'vitest';
import { renderComponentFixture, query, capture, overlayQueryAll, clearOverlayContainers } from '@memberjunction/ng-test-utils';
import { RealtimeSurfaceMoveMenuComponent, type RealtimeSurfaceMove } from './realtime-surface-move-menu.component';

/**
 * DOM spec for the deprecated call menu: it renders the shared `mj-media-move-menu` with its inputs and passes its requests
 * on. The menu's own behavior is specified in `@memberjunction/ng-realtime-media`.
 */
describe('RealtimeSurfaceMoveMenuComponent (DOM, deprecated wrapper)', () => {
  afterEach(() => clearOverlayContainers());

  const render = () =>
    renderComponentFixture(RealtimeSurfaceMoveMenuComponent, {
      inputs: { Key: 'Camera', Title: 'Camera', Placement: 'pip', Allowed: ['pip', 'tab'] },
    });

  const open = (f: ReturnType<typeof render>) => {
    (query(f, 'mj-media-move-menu button') as HTMLButtonElement).click();
    f.detectChanges();
    return overlayQueryAll('mj-menu-item') as HTMLElement[];
  };

  it('renders the shared menu with its inputs', () => {
    const f = render();
    expect(query(f, 'mj-media-move-menu button')?.getAttribute('aria-label')).toBe('Move Camera');
    const items = open(f);
    expect(items.map((item) => item.textContent?.trim())).toEqual(['Picture-in-picture', 'Tab', 'Reset layout']);
    expect(items.map((item) => item.getAttribute('aria-disabled'))).toEqual(['true', null, null]);
  });

  it("passes the shared menu's requests on", () => {
    const f = render();
    const moves: RealtimeSurfaceMove[] = capture(f.componentInstance.MoveRequested);
    const resets = capture(f.componentInstance.ResetLayoutRequested);
    open(f).find((item) => item.textContent?.trim() === 'Tab')?.click();
    open(f).find((item) => item.textContent?.trim() === 'Reset layout')?.click();
    expect(moves).toEqual([{ Key: 'Camera', Placement: 'tab' }]);
    expect(resets).toHaveLength(1);
  });
});
