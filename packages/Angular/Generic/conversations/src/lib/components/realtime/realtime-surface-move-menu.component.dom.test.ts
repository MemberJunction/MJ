import { describe, it, expect, afterEach } from 'vitest';
import { renderComponentFixture, query, capture, overlayQueryAll, clearOverlayContainers } from '@memberjunction/ng-test-utils';
import { RealtimeSurfaceMoveMenuComponent, type RealtimeSurfaceMove } from './realtime-surface-move-menu.component';

/** DOM spec for the "Move to…" menu: what it offers for a surface's current placement, and what it asks for. */
describe('RealtimeSurfaceMoveMenuComponent (DOM)', () => {
  afterEach(() => clearOverlayContainers());

  const render = (placement: 'stage' | 'pip' | 'tab' | 'hidden' = 'tab') =>
    renderComponentFixture(RealtimeSurfaceMoveMenuComponent, { inputs: { Key: 'Whiteboard', Title: 'Whiteboard', Placement: placement } });

  const open = (f: ReturnType<typeof render>) => {
    (query(f, 'button') as HTMLButtonElement).click();
    f.detectChanges();
    return overlayQueryAll('mj-menu-item') as HTMLElement[];
  };

  it('names its button and its menu after the channel', () => {
    const f = render();
    expect(query(f, 'button')?.getAttribute('aria-label')).toBe('Move Whiteboard');
    open(f);
    expect(document.querySelector('mj-menu')?.getAttribute('aria-label')).toBe('Move Whiteboard to');
  });

  it('offers every placement but the current one, then Reset layout', () => {
    const items = open(render('tab'));
    expect(items.map((item) => item.textContent?.trim())).toEqual(['Stage', 'Picture-in-picture', 'Tab', 'Hide', 'Reset layout']);
    expect(items.map((item) => item.getAttribute('aria-disabled'))).toEqual([null, null, 'true', null, null]);
  });

  it('asks for the chosen placement', () => {
    const f = render('stage');
    const moves: RealtimeSurfaceMove[] = capture(f.componentInstance.MoveRequested);
    open(f).find((item) => item.textContent?.trim() === 'Picture-in-picture')?.click();
    expect(moves).toEqual([{ Key: 'Whiteboard', Placement: 'pip' }]);
  });

  it('asks to reset the layout', () => {
    const f = render();
    const resets = capture(f.componentInstance.ResetLayoutRequested);
    open(f).find((item) => item.textContent?.trim() === 'Reset layout')?.click();
    expect(resets).toHaveLength(1);
  });
});
