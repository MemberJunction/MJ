import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { RealtimeSurfaceTabsComponent } from './realtime-surface-tabs.component';
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
