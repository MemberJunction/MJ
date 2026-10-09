import { describe, it, expect } from 'vitest';
import type { AppContextSnapshot } from '@memberjunction/ai-core-plus';
import { CarryAdditionalContext, SurfaceContextTracker, type AgentContextReporter } from '../lib/app-context-snapshot';

/**
 * The shell rebuilds the app-context snapshot on every app or nav change. The context the attached surface
 * reported through SetAgentContext survives that rebuild while the surface's tab is attached, is cleared
 * when that tab is detached, and comes back when the tab is reattached, as the surface's tools do.
 */

/** A snapshot as `updateAppContext` rebuilds it: every field except AdditionalContext. */
function rebuiltSnapshot(): AppContextSnapshot {
  return {
    App: { Name: 'Data Explorer', Description: 'Explore data' },
    ActiveNavItem: { Name: 'Queries', ResourceType: 'Custom' },
    OtherNavItems: [{ Name: 'Views' }],
    NavigableApps: [{ Name: 'Dashboards' }],
    User: { Name: 'A', Roles: ['Developer'] },
    Capabilities: { Tools: [{ Name: 'NavigateToApp', Description: 'Opens an app', InputSchema: {} }] },
  };
}

/** A resource component in the tab `tabId`. */
function component(tabId: string): AgentContextReporter {
  return { getTabId: () => tabId };
}

/** The AdditionalContext a snapshot rebuild gets from the tracker. */
function carried(tracker: SurfaceContextTracker): Record<string, unknown> | undefined {
  return CarryAdditionalContext(rebuiltSnapshot(), tracker.Context).AdditionalContext;
}

const SALES = { dashboardName: 'Sales Overview', panelCount: 4 };
const QUOTA = { dashboardName: 'Quota', panelCount: 2 };

describe('CarryAdditionalContext', () => {
  it('puts the surface context in the rebuilt snapshot', () => {
    expect(CarryAdditionalContext(rebuiltSnapshot(), SALES).AdditionalContext).toEqual(SALES);
  });

  it('leaves AdditionalContext undefined when no surface reported a context', () => {
    expect(CarryAdditionalContext(rebuiltSnapshot(), undefined).AdditionalContext).toBeUndefined();
  });

  it('takes every other field from the rebuilt snapshot and does not change it', () => {
    const rebuilt = rebuiltSnapshot();

    const result = CarryAdditionalContext(rebuilt, SALES);

    expect(result).toEqual({ ...rebuiltSnapshot(), AdditionalContext: SALES });
    expect(rebuilt).toEqual(rebuiltSnapshot());
  });
});

describe('SurfaceContextTracker', () => {
  it('carries the context into every rebuild while the reporting tab is attached', () => {
    const tracker = new SurfaceContextTracker();
    const sales = component('tab-1');

    expect(tracker.Report(sales, SALES)).toBe(true);

    expect(carried(tracker)).toEqual(SALES);
    expect(carried(tracker)).toEqual(SALES);
  });

  it('clears the context after the reporting tab is detached', () => {
    const tracker = new SurfaceContextTracker();
    const sales = component('tab-1');
    tracker.Report(sales, SALES);

    expect(tracker.Detach(sales)).toBe(true);

    expect(carried(tracker)).toBeUndefined();
  });

  it("restores the reattached tab's context in place of another tab's", () => {
    const tracker = new SurfaceContextTracker();
    const sales = component('tab-1');
    const quota = component('tab-1');
    tracker.Report(sales, SALES);
    tracker.Detach(sales);
    tracker.Report(quota, QUOTA);
    tracker.Detach(quota);

    expect(tracker.Reattach(sales)).toBe(true);

    expect(carried(tracker)).toEqual(SALES);
  });

  it('keeps the context when the tab of another component is detached', () => {
    const tracker = new SurfaceContextTracker();
    tracker.Report(component('tab-1'), SALES);

    expect(tracker.Detach(component('tab-2'))).toBe(false);

    expect(carried(tracker)).toEqual(SALES);
  });

  it('clears the context of a child component when the wrapper in its tab is detached, and restores it on reattach', () => {
    const tracker = new SurfaceContextTracker();
    const wrapper = component('tab-1');
    tracker.Report(component('tab-1'), SALES);

    expect(tracker.Detach(wrapper)).toBe(true);
    expect(carried(tracker)).toBeUndefined();

    expect(tracker.Reattach(wrapper)).toBe(true);
    expect(carried(tracker)).toEqual(SALES);
  });

  it('keeps a report from a detached tab for its reattach, and leaves the open surface its context', () => {
    const tracker = new SurfaceContextTracker();
    const sales = component('tab-1');
    tracker.Report(sales, SALES);
    tracker.Detach(sales);
    tracker.Report(component('tab-2'), QUOTA);
    const updatedSales = { ...SALES, panelCount: 5 };

    expect(tracker.Report(sales, updatedSales)).toBe(false);
    expect(carried(tracker)).toEqual(QUOTA);

    tracker.Reattach(sales);
    expect(carried(tracker)).toEqual(updatedSales);
  });

  it("restores a tab's own last context when it was detached while another tab's context was carried", () => {
    const tracker = new SurfaceContextTracker();
    const sales = component('tab-1');
    tracker.Report(sales, SALES);
    tracker.Report(component('tab-2'), QUOTA);

    expect(tracker.Detach(sales)).toBe(false);
    expect(carried(tracker)).toEqual(QUOTA);

    expect(tracker.Reattach(sales)).toBe(true);
    expect(carried(tracker)).toEqual(SALES);
  });

  it('clears the context when a tab that reported none is reattached', () => {
    const tracker = new SurfaceContextTracker();
    const list = component('tab-2');
    tracker.Detach(list);
    tracker.Report(component('tab-1'), SALES);

    expect(tracker.Reattach(list)).toBe(true);

    expect(carried(tracker)).toBeUndefined();
  });

  it('changes nothing on the reattach of a component that was not detached', () => {
    const tracker = new SurfaceContextTracker();
    tracker.Report(component('tab-1'), SALES);

    expect(tracker.Reattach(component('tab-2'))).toBe(false);

    expect(carried(tracker)).toEqual(SALES);
  });
});
