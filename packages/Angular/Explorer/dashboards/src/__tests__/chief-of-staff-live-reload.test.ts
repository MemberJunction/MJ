// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Subject } from 'rxjs';
import { MJGlobal, MJEventType } from '@memberjunction/global';
import { BaseEntity } from '@memberjunction/core';
import { ChiefOfStaffDashboardComponent } from '../ChiefOfStaff/chief-of-staff-dashboard.component';

/**
 * The cockpit reloads itself when an entity it shows changes anywhere: MJAPI broadcasts every
 * save and delete (a wake run creating an approval request included) and the client raises it
 * as a `remote-invalidate` BaseEntity event. A burst of events is one reload. A detached tab
 * (the user is on another tab) does not reload in the background; it reloads once when it is
 * shown again.
 */

type Open = Record<string, unknown>;

interface Harness {
  component: ChiefOfStaffDashboardComponent;
  load: ReturnType<typeof vi.fn>;
  reattached: Subject<unknown>;
  detached: { value: boolean };
}

function createComponent(): Harness {
  const component = Object.create(ChiefOfStaffDashboardComponent.prototype) as ChiefOfStaffDashboardComponent;
  const open = component as unknown as Open;
  const load = vi.fn(async () => undefined);
  const reattached = new Subject<unknown>();
  const detached = { value: false };
  open['LoadCockpitData'] = load;
  open['destroy$'] = new Subject<void>();
  open['navigationService'] = { IsResourceDetached: () => detached.value, ResourceReattached$: reattached };
  (open['subscribeToLiveEntityChanges'] as () => void).call(component);
  return { component, load, reattached, detached };
}

function raise(entityName: string): void {
  MJGlobal.Instance.RaiseEvent({
    event: MJEventType.ComponentEvent,
    eventCode: BaseEntity.BaseEventCode,
    component: null,
    args: { type: 'remote-invalidate', entityName, baseEntity: null, payload: { action: 'save' } },
  });
}

describe('ChiefOfStaffDashboardComponent — reloads when what it shows changes', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('reloads once for a burst of changes to entities it shows', async () => {
    const { load } = createComponent();

    raise('MJ: AI Agent Requests');
    raise('MJ: User Routine Runs');
    raise('MJ: User Routines');
    await vi.advanceTimersByTimeAsync(2000);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('ignores changes to entities it does not show', async () => {
    const { load } = createComponent();

    raise('MJ: Conversation Details');
    await vi.advanceTimersByTimeAsync(2000);

    expect(load).not.toHaveBeenCalled();
  });

  it('defers the reload while the tab is detached and runs it once when the tab is shown again', async () => {
    const { component, load, reattached, detached } = createComponent();
    detached.value = true;

    raise('MJ: AI Agent Requests');
    await vi.advanceTimersByTimeAsync(2000);
    expect(load).not.toHaveBeenCalled();

    detached.value = false;
    reattached.next(component);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);

    // Nothing pending: showing the tab again does not reload again.
    reattached.next(component);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
