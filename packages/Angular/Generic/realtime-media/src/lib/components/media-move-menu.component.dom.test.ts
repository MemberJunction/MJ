import { describe, it, expect, afterEach } from 'vitest';
import { renderComponentFixture, query, capture, overlayQueryAll, clearOverlayContainers } from '@memberjunction/ng-test-utils';
import type { MediaPlacement } from '@memberjunction/ai-realtime-client/media';
import { MediaMoveMenuComponent, type MediaMoveRequest } from './media-move-menu.component';

/** DOM spec for the shared "Move to…" menu: what it offers for a surface's current place, how hosts name places, and what it asks for. */
describe('MediaMoveMenuComponent (DOM)', () => {
  afterEach(() => clearOverlayContainers());

  const render = (inputs: { Placement?: MediaPlacement; Allowed?: readonly MediaPlacement[]; Labels?: Partial<Record<MediaPlacement, string>> } = {}) =>
    renderComponentFixture(MediaMoveMenuComponent, { inputs: { Key: 'board-1', Title: 'Whiteboard', Placement: 'tab', ...inputs } });

  const open = (f: ReturnType<typeof render>) => {
    (query(f, 'button') as HTMLButtonElement).click();
    f.detectChanges();
    return overlayQueryAll('mj-menu-item') as HTMLElement[];
  };
  const labels = (items: HTMLElement[]) => items.map((item) => item.textContent?.trim());

  it('names its button and its menu after the surface', () => {
    const f = render();
    expect(query(f, 'button')?.getAttribute('aria-label')).toBe('Move Whiteboard');
    open(f);
    expect(document.querySelector('mj-menu')?.getAttribute('aria-label')).toBe('Move Whiteboard to');
  });

  it('offers every place in order, the current one disabled, then Reset layout', () => {
    const items = open(render({ Placement: 'tab' }));
    expect(labels(items)).toEqual(['Stage', 'Picture-in-picture', 'Tab', 'Hide', 'Reset layout']);
    expect(items.map((item) => item.getAttribute('aria-disabled'))).toEqual([null, null, 'true', null, null]);
  });

  it('lists only the places the surface may go', () => {
    const items = open(render({ Placement: 'pip', Allowed: ['pip', 'tab'] }));
    expect(labels(items)).toEqual(['Picture-in-picture', 'Tab', 'Reset layout']);
    expect(items.map((item) => item.getAttribute('aria-disabled'))).toEqual(['true', null, null]);
  });

  it("names places the host's way, each keeping its icon, and the rest the call's way", () => {
    const items = open(render({ Allowed: ['stage', 'tab', 'pip'], Labels: { stage: 'Spotlight', tab: 'Filmstrip' } }));
    expect(labels(items)).toEqual(['Spotlight', 'Picture-in-picture', 'Filmstrip', 'Reset layout']);
    const icon = (item: HTMLElement) => Array.from(item.querySelector('i')?.classList ?? []).find((c) => !['mj-menu-item-icon', 'fa-solid', 'fa-regular'].includes(c));
    expect(items.map(icon)).toEqual(['fa-expand', 'fa-window-restore', 'fa-table-columns', 'fa-rotate-left']);
  });

  it('asks for the chosen place', () => {
    const f = render({ Placement: 'stage' });
    const moves: MediaMoveRequest[] = capture(f.componentInstance.MoveRequested);
    open(f).find((item) => item.textContent?.trim() === 'Picture-in-picture')?.click();
    expect(moves).toEqual([{ Key: 'board-1', Placement: 'pip' }]);
  });

  it('asks to reset the layout', () => {
    const f = render();
    const resets = capture(f.componentInstance.ResetLayoutRequested);
    open(f).find((item) => item.textContent?.trim() === 'Reset layout')?.click();
    expect(resets).toHaveLength(1);
  });
});
