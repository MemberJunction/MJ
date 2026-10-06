import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { RealtimeToolDefinition } from '@memberjunction/ai';
import { BaseRealtimeChannelClient } from '@memberjunction/realtime-runtime';
import { renderComponentFixture, query, queryAll, click, capture, overlayQueryAll, clearOverlayContainers } from '@memberjunction/ng-test-utils';
import { RealtimeSurfaceTabsComponent, type RealtimeChannelSlot } from './realtime-surface-tabs.component';
import type { RealtimeSurfaceMove } from './realtime-surface-move-menu.component';
import { RealtimeSurfaceTabsModel } from './realtime-surface-tabs.model';
import type { RealtimeSessionState } from './realtime-session-state';

/**
 * DOM-level spec for the one behavior of <mj-realtime-surface-tabs> the session depends on: reporting WHICH CHANNEL the
 * user is looking at (`ActiveChannelChange`), so that when the model can watch only one video source it is the one on
 * screen. The panel's heavy children (artifact viewers, the activity rail, the dynamic channel pane) are replaced with a
 * bare template; the tab model and the output wiring are the real ones.
 */
describe('RealtimeSurfaceTabsComponent: ActiveChannelChange (DOM)', () => {
  beforeEach(() => {
    TestBed.overrideComponent(RealtimeSurfaceTabsComponent, { set: { imports: [], template: '<div class="stub-tabs"></div>' } });
  });

  const render = () =>
    renderComponentFixture(RealtimeSurfaceTabsComponent, {
      providers: [],
      inputs: { State: {} as RealtimeSessionState },
    });

  /** Lets the component's microtask-deferred tab registration and focus land. */
  const settle = async (f: ReturnType<typeof render>): Promise<void> => {
    await f.whenStable();
    f.detectChanges();
  };

  const register = (f: ReturnType<typeof render>, key: string, focus = false) =>
    f.componentInstance.RegisterChannelTab({ Key: key, Title: key, Icon: 'fa-solid fa-cube', Focus: focus });

  it('reports the channel when its tab takes focus, and null when focus returns to a non-channel tab', async () => {
    const f = render();
    const emitted: Array<string | null> = [];
    f.componentInstance.ActiveChannelChange.subscribe((k) => emitted.push(k));
    f.componentInstance.Model.SetShowActivityTab(true);
    await settle(f);
    expect(emitted).toEqual([]); // the activity tab is not a channel: nothing changed from the initial null

    register(f, 'Whiteboard');
    f.componentInstance.RevealChannel('Whiteboard');
    await settle(f);
    expect(emitted).toEqual(['Whiteboard']);

    f.componentInstance.Model.Focus(RealtimeSurfaceTabsModel.ActivityTabKey);
    await settle(f);
    expect(emitted).toEqual(['Whiteboard', null]);
  });

  it('follows focus between channels, and reports each change once', async () => {
    const f = render();
    const emitted: Array<string | null> = [];
    f.componentInstance.ActiveChannelChange.subscribe((k) => emitted.push(k));
    register(f, 'Whiteboard', true);
    register(f, 'Media');
    await settle(f);
    f.componentInstance.Model.Focus('Media');
    f.componentInstance.Model.FlashTab('Media'); // a model change that does not change focus
    f.componentInstance.Model.Focus('Media'); // already focused: a no-op
    await settle(f);
    f.componentInstance.Model.Focus('Whiteboard');
    await settle(f);
    expect(emitted).toEqual(['Whiteboard', 'Media', 'Whiteboard']);
  });

  it('reports null when the focused channel tab is removed and nothing else is focusable', async () => {
    const f = render();
    const emitted: Array<string | null> = [];
    f.componentInstance.ActiveChannelChange.subscribe((k) => emitted.push(k));
    register(f, 'Media', true);
    await settle(f);
    f.componentInstance.RemoveTab('Media');
    await settle(f);
    expect(emitted).toEqual(['Media', null]);
  });

  it('does not report anything for model changes that leave the focused channel as it was', async () => {
    const f = render();
    const seen = vi.fn();
    register(f, 'Media', true);
    await settle(f);
    f.componentInstance.ActiveChannelChange.subscribe(seen);
    register(f, 'Media', false); // re-registering the same channel replaces its tab
    f.componentInstance.Model.SetShowActivityTab(true);
    await settle(f);
    expect(seen).not.toHaveBeenCalled();
  });
});

/** A channel plugin with a name and nothing else (no surface is created here: the overlay's stage creates it). */
class TestChannel extends BaseRealtimeChannelClient {
  public constructor(private readonly name: string) {
    super();
  }
  public get ChannelName(): string { return this.name; }
  public get ToolNamePrefix(): string { return `${this.name}_`; }
  public get TabTitle(): string { return this.name; }
  public get TabIcon(): string { return 'fa-solid fa-cube'; }
  public GetToolDefinitions(): RealtimeToolDefinition[] { return []; }
  public ApplyAgentTool(): string { return '{}'; }
}

/**
 * DOM spec for the slot a plugin channel's pane keeps for its surface, which lives on the overlay's stage: the panel
 * reports the active channel tab's slot (`ChannelSlotChange`) so the stage can lay the surface over it. Real template;
 * only plugin channel tabs are registered, so the Activity rail and artifact viewers never render.
 */
describe('RealtimeSurfaceTabsComponent: ChannelSlotChange (DOM)', () => {
  const render = () => renderComponentFixture(RealtimeSurfaceTabsComponent, { inputs: { State: {} as RealtimeSessionState } });

  /** Lets the deferred tab registration land, renders, then lets the deferred slot report land. */
  const settle = async (f: ReturnType<typeof render>): Promise<void> => {
    await f.whenStable();
    f.detectChanges();
    await Promise.resolve();
  };

  const watch = (f: ReturnType<typeof render>): Array<RealtimeChannelSlot | null> => {
    const reported: Array<RealtimeChannelSlot | null> = [];
    f.componentInstance.ChannelSlotChange.subscribe((slot) => reported.push(slot));
    return reported;
  };

  const register = (f: ReturnType<typeof render>, name: string, focus = false) =>
    f.componentInstance.RegisterChannelTab({ Key: name, Title: name, Icon: 'fa-solid fa-cube', Focus: focus, Plugin: new TestChannel(name) });

  it("reports the active channel tab's slot, inside its displayed pane, and null when another tab takes focus", async () => {
    const f = render();
    const reported = watch(f);
    register(f, 'Whiteboard', true);
    f.componentInstance.RegisterChannelTab({ Key: 'Recording', Title: 'Recording', Icon: 'fa-solid fa-play' });
    await settle(f);
    expect(reported.map((slot) => slot?.Key ?? null)).toEqual(['Whiteboard']);
    const slot = reported[0];
    expect(slot?.Element).toBe(query(f, '.s-pane__slot[data-channel-key="Whiteboard"]'));
    expect(slot?.Element.closest('.s-pane')?.classList.contains('s-pane--active')).toBe(true);

    f.componentInstance.Model.Focus('Recording');
    await settle(f);
    expect(reported.map((s) => s?.Key ?? null)).toEqual(['Whiteboard', null]);
  });

  it('follows focus from one channel to another, reporting each slot once', async () => {
    const f = render();
    const reported = watch(f);
    register(f, 'Whiteboard', true);
    register(f, 'Media');
    await settle(f);
    f.componentInstance.Model.Focus('Media');
    await settle(f);
    expect(reported.map((s) => s?.Key ?? null)).toEqual(['Whiteboard', 'Media']);
    expect(reported[1]?.Element).toBe(query(f, '.s-pane__slot[data-channel-key="Media"]'));
  });

  it('reports null while the panel is collapsed, and a fresh slot when it expands again', async () => {
    const f = render();
    const reported = watch(f);
    register(f, 'Whiteboard', true);
    await settle(f);
    const before = reported[0]?.Element;
    click(f, '.surface__toggle');
    await settle(f);
    expect(reported[1]).toBeNull();
    click(f, '.surface__toggle');
    await settle(f);
    expect(reported.map((s) => s?.Key ?? null)).toEqual(['Whiteboard', null, 'Whiteboard']);
    expect(reported[2]?.Element).not.toBe(before);
    expect(reported[2]?.Element.isConnected).toBe(true);
  });

  it('keeps no slot for a channel tab without a plugin', async () => {
    const f = render();
    const reported = watch(f);
    f.componentInstance.RegisterChannelTab({ Key: 'Recording', Title: 'Recording', Icon: 'fa-solid fa-play', Focus: true });
    await settle(f);
    expect(query(f, '.s-pane__slot')).toBeNull();
    expect(reported).toEqual([]);
  });
});

/**
 * DOM spec for moving a channel's surface from the panel: "Move to…" sits beside the active channel tab, and a channel
 * whose surface is elsewhere says where in its pane and offers it back. Real template; only plugin channel tabs.
 */
describe('RealtimeSurfaceTabsComponent: moving surfaces (DOM)', () => {
  afterEach(() => clearOverlayContainers());

  const render = (placements: ReadonlyMap<string, 'stage' | 'tab' | 'hidden'> = new Map()) =>
    renderComponentFixture(RealtimeSurfaceTabsComponent, { inputs: { State: {} as RealtimeSessionState, SurfacePlacements: placements } });

  const settle = async (f: ReturnType<typeof render>): Promise<void> => {
    await f.whenStable();
    f.detectChanges();
    await Promise.resolve();
  };

  const register = (f: ReturnType<typeof render>, name: string, focus = false) =>
    f.componentInstance.RegisterChannelTab({ Key: name, Title: name, Icon: 'fa-solid fa-cube', Focus: focus, Plugin: new TestChannel(name) });

  it('offers "Move to…" beside the active channel tab only', async () => {
    const f = render();
    register(f, 'Whiteboard', true);
    register(f, 'Media');
    await settle(f);
    expect(queryAll(f, 'mj-realtime-surface-move-menu')).toHaveLength(1);
    expect(query(f, '.s-tab--active + mj-realtime-surface-move-menu')).not.toBeNull();
    f.componentInstance.Model.Focus('Media');
    await settle(f);
    expect(query(f, '.s-tab--active + mj-realtime-surface-move-menu button')?.getAttribute('aria-label')).toBe('Move Media');
  });

  it('passes on the move chosen in the menu', async () => {
    const f = render();
    const moves: RealtimeSurfaceMove[] = capture(f.componentInstance.MoveRequested);
    register(f, 'Whiteboard', true);
    await settle(f);
    (query(f, 'mj-realtime-surface-move-menu button') as HTMLButtonElement).click();
    f.detectChanges();
    (overlayQueryAll('mj-menu-item') as HTMLElement[]).find((item) => item.textContent?.trim() === 'Hide')?.click();
    expect(moves).toEqual([{ Key: 'Whiteboard', Placement: 'hidden' }]);
  });

  it('says where a moved surface is, keeps no slot for it, and brings it back', async () => {
    const f = render(new Map([['Whiteboard', 'hidden']]));
    const moves: RealtimeSurfaceMove[] = capture(f.componentInstance.MoveRequested);
    const slots: Array<RealtimeChannelSlot | null> = capture(f.componentInstance.ChannelSlotChange);
    register(f, 'Whiteboard', true);
    await settle(f);
    expect(query(f, '.s-pane__away span')?.textContent?.trim()).toBe('Whiteboard is hidden.');
    expect(query(f, '.s-pane__slot')).toBeNull();
    expect(slots).toEqual([]);
    click(f, '.s-pane__away button');
    expect(moves).toEqual([{ Key: 'Whiteboard', Placement: 'tab' }]);
  });
});
