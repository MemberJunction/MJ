/**
 * Logic spec for ComponentCacheManager's resource identity key.
 *
 * Every dynamic view carries the recordId marker 'dynamic' (NavigationService.OpenDynamicView), so
 * the key has to fold in the entity or two dynamic views in one app collide. A collision is not
 * just a wrong-content bug: the tab-container reloads a dynamic tab when its Entity changes, and if
 * the cache then hands back the component it just detached — which still reports the old Entity —
 * the reload check fires again on every emission and the page never yields.
 *
 * Exercised through the public API (cache, detach, look up), not the private key builder, so the
 * spec pins the behaviour callers depend on. Node preset: nothing here renders.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@angular/core', () => ({ ComponentRef: class {}, ApplicationRef: class {} }));
vi.mock('@memberjunction/ng-shared', () => ({ BaseResourceComponent: class {}, NavigationService: class {} }));
vi.mock('@memberjunction/core-entities', () => ({ ResourceData: class {} }));

import { ComponentCacheManager } from './component-cache-manager';

const DRIVER = 'ViewResource';
const APP = 'app-1';

type CacheArgs = Parameters<ComponentCacheManager['CacheComponent']>;

/** Cache a component for a resource, then detach it so it is available for reuse. */
function cacheAndDetach(manager: ComponentCacheManager, recordId: string, entity?: string): void {
  const resourceData = {
    ResourceType: 'User Views',
    ResourceRecordID: recordId,
    Configuration: { applicationId: APP, resourceTypeDriverClass: DRIVER, Entity: entity },
  } as unknown as CacheArgs[2];
  const componentRef = { instance: {}, destroy: vi.fn() } as unknown as CacheArgs[0];
  manager.CacheComponent(componentRef, {} as HTMLElement, resourceData, 'tab-1');
  manager.MarkAsDetached(DRIVER, recordId, APP, entity);
}

/** No navigation service, and eviction only starts past MaxDetachedComponents, so ApplicationRef is never touched. */
const manager = (): ComponentCacheManager =>
  new ComponentCacheManager({} as ConstructorParameters<typeof ComponentCacheManager>[0]);

describe('ComponentCacheManager — dynamic views', () => {
  it('keeps dynamic views of different entities apart', () => {
    const m = manager();
    cacheAndDetach(m, 'dynamic', 'Accounts');
    expect(m.GetCachedComponent(DRIVER, 'dynamic', APP, 'Contacts')).toBeNull();
  });

  it('still reuses a dynamic view of the same entity', () => {
    const m = manager();
    cacheAndDetach(m, 'dynamic', 'Accounts');
    expect(m.GetCachedComponent(DRIVER, 'dynamic', APP, 'Accounts')).not.toBeNull();
  });

  it('matches the marker the way ViewResourceComponent does (trimmed, case-insensitive)', () => {
    const m = manager();
    cacheAndDetach(m, 'Dynamic', 'Accounts');
    expect(m.GetCachedComponent(DRIVER, 'Dynamic', APP, 'Contacts')).toBeNull();
    expect(ComponentCacheManager.IsDynamicViewMarker(' DYNAMIC ')).toBe(true);
    expect(ComponentCacheManager.IsDynamicViewMarker('view-1')).toBe(false);
  });
});

describe('ComponentCacheManager — other resources are unchanged', () => {
  it('keys a real record id on the id alone, whatever the entity', () => {
    const m = manager();
    cacheAndDetach(m, 'view-1', 'Accounts');
    expect(m.GetCachedComponent(DRIVER, 'view-1', APP, 'Contacts')).not.toBeNull();
    expect(m.GetCachedComponent(DRIVER, 'view-1', APP)).not.toBeNull();
  });

  it('still separates "new record" tabs of different entities by the empty-id rule', () => {
    const m = manager();
    cacheAndDetach(m, '', 'MJ: Companies');
    expect(m.GetCachedComponent(DRIVER, '', APP, 'MJ: Employees')).toBeNull();
    expect(m.GetCachedComponent(DRIVER, '', APP, 'MJ: Companies')).not.toBeNull();
  });
});
