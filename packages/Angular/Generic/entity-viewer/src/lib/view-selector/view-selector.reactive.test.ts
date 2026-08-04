import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import type { EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { UserViewEngine, MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { ViewSelectorComponent } from './view-selector.component';

/**
 * Reactive-sync coverage for ViewSelectorComponent (the "Alternative A" fix).
 *
 * The dropdown MUST stay in sync with UserViewEngine's cache purely by reacting to the
 * engine's `ObserveProperty('_views')` stream — no manual reload after a save/delete. This
 * eliminates the stale-cache race the old fire-and-forget `LoadViews()`-after-`Save()` had
 * (the engine's auto-invalidation is async and hadn't landed by the time LoadViews read).
 *
 * We drive a fake engine whose ObserveProperty is a BehaviorSubject and assert the component
 * re-derives its owned/shared lists whenever that subject emits — without any further call.
 */

const CURRENT_USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const ENTITY_ID = 'entity-1';

/** Minimal view stub — only the fields mapViewToListItem / the owned-vs-shared filter read. */
function makeView(id: string, userId: string, name: string, isShared = false): MJUserViewEntityExtended {
  return {
    ID: id,
    UserID: userId,
    Name: name,
    IsShared: isShared,
    IsDefault: false,
    UserCanEdit: true,
    UserCanView: true,
    Description: '',
  } as unknown as MJUserViewEntityExtended;
}

interface FakeEngine {
  Config: ReturnType<typeof vi.fn>;
  ObserveProperty: ReturnType<typeof vi.fn>;
  GetAccessibleViewsForEntity: ReturnType<typeof vi.fn>;
}

describe('ViewSelectorComponent — reactive engine sync (Alternative A)', () => {
  let component: ViewSelectorComponent;
  // The engine's cached `_views`, filtered to the entity — what GetAccessibleViewsForEntity returns.
  let accessible: MJUserViewEntityExtended[];
  // Stand-in for ObserveProperty('_views'): replays current on subscribe, re-emits on change.
  let viewsSubject: BehaviorSubject<MJUserViewEntityExtended[]>;
  let fakeEngine: FakeEngine;

  beforeEach(() => {
    accessible = [];
    viewsSubject = new BehaviorSubject<MJUserViewEntityExtended[]>([]);
    fakeEngine = {
      Config: vi.fn().mockResolvedValue(undefined),
      ObserveProperty: vi.fn((): Observable<MJUserViewEntityExtended[]> => viewsSubject.asObservable()),
      GetAccessibleViewsForEntity: vi.fn((entityId: string) => (entityId === ENTITY_ID ? accessible : [])),
    };
    vi.spyOn(UserViewEngine, 'Instance', 'get').mockReturnValue(fakeEngine as unknown as UserViewEngine);

    const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
    component = new ViewSelectorComponent(cdr);
    component.Provider = { CurrentUser: { ID: CURRENT_USER_ID } } as unknown as IMetadataProvider;
    component.Entity = { ID: ENTITY_ID } as unknown as EntityInfo;
  });

  afterEach(() => {
    component.ngOnDestroy();
    vi.restoreAllMocks();
  });

  it('derives owned and shared lists on initial load', async () => {
    accessible = [makeView('v1', CURRENT_USER_ID, 'Mine'), makeView('v2', OTHER_USER_ID, 'Theirs', true)];
    viewsSubject.next(accessible);

    await component.LoadViews();

    expect(component.MyViews.map(v => v.id)).toEqual(['v1']);
    expect(component.SharedViews.map(v => v.id)).toEqual(['v2']);
  });

  it('adds a newly-saved view reactively — no manual reload after the emit', async () => {
    await component.LoadViews();
    expect(component.MyViews).toEqual([]);

    // Simulate a save: engine auto-invalidation lands the new row in the cache, then emits.
    accessible = [makeView('new-1', CURRENT_USER_ID, 'Just Saved')];
    viewsSubject.next(accessible);

    // No LoadViews() call here — the subscription alone must refresh the list.
    expect(component.MyViews.map(v => v.id)).toEqual(['new-1']);
  });

  it('drops a deleted view reactively', async () => {
    accessible = [makeView('v1', CURRENT_USER_ID, 'Doomed')];
    viewsSubject.next(accessible);
    await component.LoadViews();
    expect(component.MyViews.map(v => v.id)).toEqual(['v1']);

    accessible = [];
    viewsSubject.next(accessible);

    expect(component.MyViews).toEqual([]);
  });

  it('subscribes to the engine only once across repeated LoadViews() calls', async () => {
    await component.LoadViews();
    await component.LoadViews();
    await component.LoadViews();

    expect(fakeEngine.ObserveProperty).toHaveBeenCalledTimes(1);
    expect(fakeEngine.ObserveProperty).toHaveBeenCalledWith('_views');
  });

  it('never forces a cache refresh — Config is always called with false', async () => {
    await component.LoadViews();
    accessible = [makeView('v1', CURRENT_USER_ID, 'Mine')];
    viewsSubject.next(accessible);

    expect(fakeEngine.Config).toHaveBeenCalledWith(false);
    for (const call of fakeEngine.Config.mock.calls) {
      expect(call[0]).toBe(false);
    }
  });
});
