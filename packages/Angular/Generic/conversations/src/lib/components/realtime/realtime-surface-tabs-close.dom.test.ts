import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { RealtimeSurfaceTabsComponent } from './realtime-surface-tabs.component';
import { RealtimeSessionState } from './realtime-session-state';

/**
 * DOM spec for the per-tab CLOSE affordance (#3498).
 *
 * Before this, two open surfaces could only be reduced by ending the call — which tore down both
 * plus the voice session. The control below is the missing half; the other half is that pressing it
 * asks the HOST to close the channel rather than hiding the tab itself, because a hidden tab leaves
 * the plugin initialized, its tools answering, and its server-side browser running.
 */
describe('RealtimeSurfaceTabsComponent — closing one surface (DOM)', () => {
  const render = () =>
    renderComponentFixture(RealtimeSurfaceTabsComponent, {
      inputs: { State: new RealtimeSessionState() },
    });

  /**
   * `RegisterChannelTab` defers its mutation to a microtask (the component's own NG0100 guard), so
   * every test has to let that land before the strip reflects it.
   */
  const flush = async (f: { detectChanges(): void }) => {
    await Promise.resolve();
    f.detectChanges();
  };

  it('renders a close control on a channel tab and none on Activity', async () => {
    const f = render();
    f.componentInstance.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
    f.componentInstance.ShowActivityTab = true;
    await flush(f);

    const closers = queryAll(f, '.s-tab__close');
    expect(closers).toHaveLength(1);
    expect(closers[0].getAttribute('aria-label')).toBe('Close Whiteboard');
  });

  it('renders no close control when the host marked the channel un-closable', async () => {
    const f = render();
    f.componentInstance.RegisterChannelTab({
      Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard', Closable: false,
    });
    await flush(f);

    expect(queryAll(f, '.s-tab')).toHaveLength(1);   // the tab IS there…
    expect(query(f, '.s-tab__close')).toBeNull();    // …it just cannot be dismissed
  });

  it('asks the host to close, and does NOT remove the tab itself', async () => {
    const f = render();
    f.componentInstance.RegisterChannelTab({ Key: 'Remote Browser', Title: 'Remote Browser', Icon: 'fa-solid fa-globe' });
    await flush(f);
    const requested: string[] = [];
    f.componentInstance.CloseTabRequested.subscribe((key: string) => requested.push(key));

    query(f, '.s-tab__close')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    f.detectChanges();

    expect(requested).toEqual(['Remote Browser']);
    // Still there: removing it here would hide a surface whose plugin is still live and whose tools
    // still answer. The tab goes when the CHANNEL goes.
    expect(f.componentInstance.Model.Tabs.some(t => t.Key === 'Remote Browser')).toBe(true);
  });

  it('does not focus the tab being dismissed', async () => {
    const f = render();
    f.componentInstance.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard', Focus: true });
    f.componentInstance.RegisterChannelTab({ Key: 'Remote Browser', Title: 'Remote Browser', Icon: 'fa-solid fa-globe' });
    await flush(f);
    expect(f.componentInstance.Model.ActiveKey).toBe('Whiteboard');

    // The close control LOOKS like it is inside the tab, but it is a sibling — a button cannot
    // contain a button. That structure is what stops a dismissal from first switching the user to
    // the surface they are getting rid of, so this test fails if anyone nests the two.
    queryAll(f, '.s-tab__close')[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    f.detectChanges();

    expect(f.componentInstance.Model.ActiveKey).toBe('Whiteboard');
  });
});
