import { describe, it, expect } from 'vitest';
import type { EntityInfo, UserInfo } from '@memberjunction/core';
import { GridViewRendererComponent } from '../lib/view-types/renderers/grid-view-renderer.component';
import type { GridViewConfig } from '../lib/view-types/renderers/grid-view-renderer.component';

/**
 * The grid's Delete affordance must actually be reachable.
 *
 * The wrapper has always deleted correctly — `onDeleteConfirmed()` walks every
 * selected record, reports per-record failures and reloads the page. But the
 * template renders the button only when `ToolbarConfig.showDelete && AllowDelete`,
 * both of which default to false, and the wrapper set NEITHER. So the whole path
 * was unreachable: in Explorer there was no way to remove ten rows except to open
 * ten records, one at a time.
 *
 * These pin the gate rather than the button: shown exactly when the user could
 * delete anyway, and an explicit view config still wins in both directions.
 */

type Host = {
  entity: EntityInfo | null;
  config: GridViewConfig;
  canDelete: boolean;
  effectiveToolbarConfig: { showDelete?: boolean };
};

const USER = { ID: 'U-1' } as unknown as UserInfo;

/** An EntityInfo whose permission check answers `canDelete`, or throws. */
function mockEntity(canDelete: boolean | 'throws'): EntityInfo {
  return {
    Name: 'Companies',
    GetUserPermisions: () => {
      if (canDelete === 'throws') {
        throw new Error('metadata unavailable');
      }
      return { CanDelete: canDelete };
    }
  } as unknown as EntityInfo;
}

/** The component without Angular DI, with a stubbed provider. */
function host(entity: EntityInfo | null, config: GridViewConfig = {}, user: UserInfo | null = USER): Host {
  const c = Object.create(GridViewRendererComponent.prototype) as Host;
  c.entity = entity;
  c.config = config;
  Object.defineProperty(c, 'ProviderToUse', { get: () => ({ CurrentUser: user }) });
  return c;
}

describe('grid Delete affordance', () => {
  it('is offered when the user may delete this entity', () => {
    const c = host(mockEntity(true));
    expect(c.canDelete).toBe(true);
    expect(c.effectiveToolbarConfig.showDelete).toBe(true);
  });

  it('is withheld when the user may not', () => {
    // Defaulting to the permission, not to `true`, keeps the button off exactly
    // where the delete would have been refused anyway.
    const c = host(mockEntity(false));
    expect(c.canDelete).toBe(false);
    expect(c.effectiveToolbarConfig.showDelete).toBe(false);
  });

  it('an explicit view config wins in both directions', () => {
    expect(host(mockEntity(true), { toolbarConfig: { showDelete: false } }).effectiveToolbarConfig.showDelete).toBe(false);
    expect(host(mockEntity(false), { toolbarConfig: { showDelete: true } }).effectiveToolbarConfig.showDelete).toBe(true);
  });

  it('an explicit showDelete never grants the permission itself', () => {
    // The template needs AllowDelete too, and that is bound to canDelete — so a
    // view config cannot talk the grid into offering a delete the user can't do.
    const c = host(mockEntity(false), { toolbarConfig: { showDelete: true } });
    expect(c.canDelete).toBe(false);
  });

  it('preserves the rest of the toolbar config', () => {
    const c = host(mockEntity(true), { toolbarConfig: { showDelete: undefined, showExport: false } as never });
    expect((c.effectiveToolbarConfig as { showExport?: boolean }).showExport).toBe(false);
  });

  it('withholds it when there is no entity yet', () => {
    expect(host(null).canDelete).toBe(false);
  });

  it('withholds it when there is no current user', () => {
    expect(host(mockEntity(true), {}, null).canDelete).toBe(false);
  });

  it('treats a provider that cannot answer as "no", not as permission', () => {
    expect(host(mockEntity('throws')).canDelete).toBe(false);
  });
});
