/**
 * Tests for the agent updates NavigationService emits when the shell detaches and reattaches a cached
 * resource component's tab: the tools replay, and the Lifecycle mark that tells the shell to clear or
 * restore the context the surface reported.
 *
 * Mock preamble as in open-dashboard.test.ts: the Angular decorators have to be inert before
 * NavigationService can be imported.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NavigationService, type AgentContextUpdate } from '../navigation.service';
import type { BaseResourceComponent } from '../base-resource-component';
import type { ApplicationManager, WorkspaceStateManager } from '@memberjunction/ng-base-application';

vi.mock(import('@angular/core'), async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    Directive:
      () =>
      <T>(target: T) =>
        target,
    Injectable:
      () =>
      <T>(target: T) =>
        target,
    inject: vi.fn(),
  };
});
vi.mock('@angular/router', () => ({}));
vi.mock('@memberjunction/ng-base-types', () => ({ BaseAngularComponent: class {} }));
vi.mock('@memberjunction/core', () => ({
  BaseEntity: class {},
  Metadata: class {},
  CompositeKey: class {},
  LogError: vi.fn(),
}));
vi.mock('@memberjunction/core-entities', () => ({ ResourceData: class {} }));
vi.mock('@memberjunction/global', () => ({
  UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase(),
  GetGlobalObjectStore: () => ({}),
}));

/** A resource component in the tab `tabId`, as the cache manager passes it. Its identity and tab id matter here. */
function resource(tabId = ''): BaseResourceComponent {
  return { getTabId: () => tabId } as unknown as BaseResourceComponent;
}

const TOOLS: NonNullable<AgentContextUpdate['AgentClientTools']> = [
  { Name: 'AddPanel', Description: 'Adds a panel', ParameterSchema: {}, Handler: async () => ({ Success: true }) },
];
const LATER_TOOLS: NonNullable<AgentContextUpdate['AgentClientTools']> = [
  { Name: 'RemovePanel', Description: 'Removes a panel', ParameterSchema: {}, Handler: async () => ({ Success: true }) },
];

describe('NavigationService agent updates on tab detach and reattach', () => {
  let service: NavigationService;
  let updates: AgentContextUpdate[];

  beforeEach(() => {
    // The constructor listens for mousedown on the document to track the Shift key.
    vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    service = new NavigationService({} as WorkspaceStateManager, {} as ApplicationManager);
    updates = [];
    service.AgentContextUpdated$.subscribe((update) => updates.push(update));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks the update of a detach, which clears the tools', () => {
    const dashboard = resource();
    service.SetAgentClientTools(dashboard, TOOLS);

    service.NotifyResourceDetached(dashboard);

    expect(updates.at(-1)).toEqual({ Caller: dashboard, AgentClientTools: [], Lifecycle: 'Detached' });
  });

  it('marks the update of a reattach, which replays the tools captured at the detach', () => {
    const dashboard = resource();
    service.SetAgentClientTools(dashboard, TOOLS);
    service.NotifyResourceDetached(dashboard);

    service.NotifyResourceReattached(dashboard);

    expect(updates.at(-1)).toEqual({ Caller: dashboard, AgentClientTools: TOOLS, Lifecycle: 'Reattached' });
  });

  it('emits nothing on the reattach of a component that was never detached', () => {
    service.NotifyResourceReattached(resource());

    expect(updates).toEqual([]);
  });

  it('leaves the updates a component reports unmarked', () => {
    const dashboard = resource();

    service.SetAgentContext(dashboard, { dashboardName: 'Sales' });
    service.SetAgentClientTools(dashboard, TOOLS);

    expect(updates).toEqual([
      { Caller: dashboard, AgentContext: { dashboardName: 'Sales' } },
      { Caller: dashboard, AgentClientTools: TOOLS },
    ]);
  });

  it('leaves the attached surface its tools when another tab detaches, and still marks the detach', () => {
    const dashboard = resource('tab-dashboard');
    const browse = resource('tab-browse');
    service.SetAgentClientTools(dashboard, TOOLS);

    service.NotifyResourceDetached(browse);

    expect(updates.at(-1)).toEqual({ Caller: browse, Lifecycle: 'Detached' });
  });

  it('does not replay the attached surface\'s tools when that other tab reattaches', () => {
    const dashboard = resource('tab-dashboard');
    const browse = resource('tab-browse');
    service.SetAgentClientTools(dashboard, TOOLS);
    service.NotifyResourceDetached(browse);

    service.NotifyResourceReattached(browse);

    expect(updates.at(-1)).toEqual({ Caller: browse, Lifecycle: 'Detached' });
  });

  it('clears the tools when the attached surface\'s own tab detaches after another tab did', () => {
    const dashboard = resource('tab-dashboard');
    const browse = resource('tab-browse');
    service.SetAgentClientTools(dashboard, TOOLS);
    service.NotifyResourceDetached(browse);

    service.NotifyResourceDetached(dashboard);

    expect(updates.at(-1)).toEqual({ Caller: dashboard, AgentClientTools: [], Lifecycle: 'Detached' });
  });

  it('clears and replays the tools a child registered when its tab detaches and reattaches through the wrapper', () => {
    const child = resource('tab-dashboard');
    const wrapper = resource('tab-dashboard');
    service.SetAgentClientTools(child, TOOLS);

    service.NotifyResourceDetached(wrapper);
    expect(updates.at(-1)).toEqual({ Caller: wrapper, AgentClientTools: [], Lifecycle: 'Detached' });

    service.NotifyResourceReattached(wrapper);
    expect(updates.at(-1)).toEqual({ Caller: wrapper, AgentClientTools: TOOLS, Lifecycle: 'Reattached' });
  });

  it('keeps the tools a detached tab registers for its reattach instead of giving them to the agent', () => {
    const dashboard = resource('tab-dashboard');
    const browse = resource('tab-browse');
    service.SetAgentClientTools(dashboard, TOOLS);
    service.NotifyResourceDetached(dashboard);
    service.SetAgentClientTools(browse, []);

    service.SetAgentClientTools(dashboard, LATER_TOOLS);
    expect(updates.at(-1)).toEqual({ Caller: browse, AgentClientTools: [] });

    service.NotifyResourceDetached(browse);
    service.NotifyResourceReattached(dashboard);
    expect(updates.at(-1)).toEqual({ Caller: dashboard, AgentClientTools: LATER_TOOLS, Lifecycle: 'Reattached' });
  });

  it('gives the agent the tools of a new component in the tab of a detached one', () => {
    const previous = resource('tab-dashboard');
    service.SetAgentClientTools(previous, TOOLS);
    service.NotifyResourceDetached(previous);
    const replacement = resource('tab-dashboard');

    service.SetAgentClientTools(replacement, LATER_TOOLS);

    expect(updates.at(-1)).toEqual({ Caller: replacement, AgentClientTools: LATER_TOOLS });
  });
});
