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

describe('ComponentCacheManager — entity record tabs (IS-A hierarchies)', () => {
  const RECORD_DRIVER = 'RecordResource';
  const SHARED_PK = 'ID|65960000-1111-4420-8420-000000006596';

  function cacheAndDetachRecord(m: ComponentCacheManager, recordId: string, entity: string): void {
    const resourceData = {
      ResourceType: 'Records',
      ResourceRecordID: recordId,
      Configuration: { applicationId: APP, resourceTypeDriverClass: RECORD_DRIVER, Entity: entity },
    } as unknown as CacheArgs[2];
    const componentRef = { instance: {}, destroy: vi.fn() } as unknown as CacheArgs[0];
    m.CacheComponent(componentRef, {} as HTMLElement, resourceData, 'tab-record');
    m.MarkAsDetached(RECORD_DRIVER, recordId, APP, entity);
  }

  it('keeps record tabs of different entities apart even when they share the exact same PK (IS-A hierarchy)', () => {
    const m = manager();
    cacheAndDetachRecord(m, SHARED_PK, 'MJ_BizApps_Tasks: Tasks');
    // Looking up the child entity with the same PK must NOT return the parent entity's component
    expect(m.GetCachedComponent(RECORD_DRIVER, SHARED_PK, APP, 'MJ_BizApps_Tasks_GitHub: Git Hub Pull Request Tasks')).toBeNull();
  });

  it('still reuses a record tab of the same entity and same PK', () => {
    const m = manager();
    cacheAndDetachRecord(m, SHARED_PK, 'MJ_BizApps_Tasks: Tasks');
    expect(m.GetCachedComponent(RECORD_DRIVER, SHARED_PK, APP, 'MJ_BizApps_Tasks: Tasks')).not.toBeNull();
  });

  it('preserves entity discriminator when rekeying a newly saved record', () => {
    const m = manager();
    const entity = 'MJ_BizApps_Tasks: Tasks';
    const resourceData = {
      ResourceType: 'Records',
      ResourceRecordID: '',
      Configuration: { applicationId: APP, resourceTypeDriverClass: RECORD_DRIVER, Entity: entity },
    } as unknown as CacheArgs[2];
    const componentRef = { instance: {}, destroy: vi.fn() } as unknown as CacheArgs[0];
    m.CacheComponent(componentRef, {} as HTMLElement, resourceData, 'tab-new');
    m.RekeyComponent(RECORD_DRIVER, '', SHARED_PK, APP, entity);
    m.MarkAsDetached(RECORD_DRIVER, SHARED_PK, APP, entity);

    // Should find the component under the new PK with the same entity
    expect(m.GetCachedComponent(RECORD_DRIVER, SHARED_PK, APP, entity)).not.toBeNull();
    // But not under another entity with the same PK
    expect(m.GetCachedComponent(RECORD_DRIVER, SHARED_PK, APP, 'MJ_BizApps_Tasks_GitHub: Git Hub Pull Request Tasks')).toBeNull();
  });
});
