/**
 * The shell detaches a cached resource component when its tab leaves the screen and reattaches it
 * when the user comes back. A component that publishes agent context must not replace the context
 * of the surface on screen while it is detached, and it runs no init on reattach, so the service
 * says whether a component is detached and announces each reattach.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BaseResourceComponent } from '../base-resource-component';

vi.mock('@angular/core', () => ({
  Directive: () => (target: Function) => target,
  Injectable: () => (target: Function) => target,
  OnInit: class {},
  OnDestroy: class {},
  inject: vi.fn(),
  Input: () => () => {},
  Output: () => () => {},
  EventEmitter: class { emit() {} },
}));
vi.mock('@angular/router', () => ({}));
vi.mock('@memberjunction/ng-base-types', () => ({ BaseAngularComponent: class {} }));
vi.mock('@memberjunction/core', () => ({ BaseEntity: class {}, Metadata: class {}, CompositeKey: class {}, LogError: vi.fn() }));
vi.mock('@memberjunction/core-entities', () => ({ ResourceData: class {} }));
vi.mock('@memberjunction/global', () => ({ UUIDsEqual: (a: string, b: string) => a === b }));

import { NavigationService } from '../navigation.service';

function service(): NavigationService {
  // The constructor listens for mouse clicks on the document.
  vi.stubGlobal('document', new EventTarget());
  return new NavigationService({} as never, {} as never);
}

const resource = (): BaseResourceComponent => ({}) as BaseResourceComponent;

describe('NavigationService — resource attachment', () => {
  let nav: NavigationService;
  beforeEach(() => { nav = service(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('counts a component as detached from detach until reattach', () => {
    const tab = resource();
    expect(nav.IsResourceDetached(tab)).toBe(false);
    nav.NotifyResourceDetached(tab);
    expect(nav.IsResourceDetached(tab)).toBe(true);
    nav.NotifyResourceReattached(tab);
    expect(nav.IsResourceDetached(tab)).toBe(false);
  });

  it('announces a reattach even when the component registered no tools', () => {
    const tab = resource();
    const announced: BaseResourceComponent[] = [];
    nav.ResourceReattached$.subscribe((r) => announced.push(r));
    nav.NotifyResourceReattached(tab);
    expect(announced).toEqual([tab]);
  });

  it('still replays the tools captured at detach', () => {
    const tab = resource();
    const tools = [{ Name: 'Refresh', Description: '', ParameterSchema: {}, Handler: async () => null }];
    nav.SetAgentClientTools(tab, tools);
    nav.NotifyResourceDetached(tab);
    const replayed: unknown[] = [];
    nav.AgentContextUpdated$.subscribe((u) => replayed.push(u.AgentClientTools));
    nav.NotifyResourceReattached(tab);
    expect(replayed).toEqual([tools]);
  });

  it('forgets a destroyed component', () => {
    const tab = resource();
    nav.NotifyResourceDetached(tab);
    nav.ForgetResource(tab);
    expect(nav.IsResourceDetached(tab)).toBe(false);
  });

  // The cache's ClearCache paths destroy components without calling ForgetResource, so the
  // detached marks must not keep a destroyed component alive.
  it('holds its detached marks weakly', () => {
    const marks = (nav as unknown as { detachedResources: unknown }).detachedResources;
    expect(marks).toBeInstanceOf(WeakSet);
  });
});
