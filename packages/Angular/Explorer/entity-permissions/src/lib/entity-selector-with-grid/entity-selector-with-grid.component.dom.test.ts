import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { query } from '@memberjunction/ng-test-utils';
import { createFakeProvider, useFakeGlobalProvider } from '@memberjunction/ng-test-utils';
import type { EntityInfo } from '@memberjunction/core';
import { EntityPermissionsSelectorWithGridComponent } from './entity-selector-with-grid.component';
import { EntityPermissionsModule } from '../module';

/**
 * DOM coverage for <mj-entity-permissions-selector-with-grid> — an entity dropdown that reveals the
 * permission grid once an entity is chosen. `ngOnInit` reads `ProviderToUse.Entities` synchronously
 * into the dropdown, so a single render suffices for the selector's own surface. The inner
 * <mj-entity-permissions-grid> reaches the GLOBAL provider (it isn't handed `[Provider]`), so a
 * `useFakeGlobalProvider` keeps its async load from blowing up when we assert it has mounted.
 */

// Minimal entity catalog — `Partial<EntityInfo>` is exactly what createFakeProvider's
// `entities` option accepts, so the fields we DO provide stay type-checked.
const ENTITIES: Array<Partial<EntityInfo>> = [{ Name: 'Users' }, { Name: 'Accounts' }];

function render(inputs: Record<string, unknown> = {}, entities: Array<Partial<EntityInfo>> = ENTITIES): ComponentFixture<EntityPermissionsSelectorWithGridComponent> {
  TestBed.configureTestingModule({ imports: [EntityPermissionsModule] });
  const fixture = TestBed.createComponent(EntityPermissionsSelectorWithGridComponent);
  fixture.componentRef.setInput('Provider', createFakeProvider({ entities }));
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges(false);
  return fixture;
}

describe('EntityPermissionsSelectorWithGridComponent (DOM)', () => {
  // Registers beforeEach/afterEach to save+restore the global provider; call the returned installer
  // inside a test to swap in the fake the inner grid loads through.
  const installGlobal = useFakeGlobalProvider();

  // The dropdown auto-selects the first entity on init, which mounts the inner grid; that grid
  // loads through the GLOBAL provider (it isn't handed `[Provider]`). Install a clean fake for
  // every test so the inner load resolves quietly instead of throwing on an unset global.
  beforeEach(() => installGlobal({ runViewResults: [], roles: [], entities: ENTITIES }));

  it('renders the entity selector dropdown', () => {
    expect(query(render(), 'mj-dropdown')).not.toBeNull();
  });

  it('does not render the inner permission grid when no entity is selectable (empty catalog)', () => {
    // With an empty entity catalog the dropdown has nothing to select, so CurrentEntity stays
    // unset and the `@if (CurrentEntity)` grid is not rendered.
    expect(query(render({}, []), 'mj-entity-permissions-grid')).toBeNull();
  });

  it('reveals the inner permission grid, auto-selecting the first entity from the provider catalog', () => {
    // The reveal is driven by ngOnInit sorting ProviderToUse.Entities and setting CurrentEntity to
    // the first one (a `CurrentEntity` @Input would be overwritten by ngOnInit, so it's not the real
    // lever). ENTITIES = [Users, Accounts] sorts to [Accounts, Users], so 'Accounts' is auto-selected.
    const fixture = render();
    // The auto-selected entity is the first sorted one, proving the provider catalog drove the reveal.
    expect(fixture.componentInstance.CurrentEntity?.Name).toBe('Accounts');
    // And the `@if (CurrentEntity)` grid is now in the DOM as a result.
    expect(query(fixture, 'mj-entity-permissions-grid')).not.toBeNull();
  });
});
