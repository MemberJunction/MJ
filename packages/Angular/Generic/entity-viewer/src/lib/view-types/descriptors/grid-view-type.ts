import { Type } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseViewTypeDescriptor } from '../view-type.contracts';
import { GridViewRendererComponent } from '../renderers/grid-view-renderer.component';

/**
 * Grid view type — the classic tabular AG-Grid renderer. Available for every entity.
 *
 * Registration key (`DriverClass`) matches the `MJ: View Types` metadata seed:
 * `metadata/view-types/.view-types.json` → "GridViewType".
 */
@RegisterClass(BaseViewTypeDescriptor, 'GridViewType')
export class GridViewType extends BaseViewTypeDescriptor {
  readonly Name = 'GridViewType';
  readonly DisplayName = 'Grid';
  readonly Icon = 'fa-solid fa-table';
  readonly RendererComponent: Type<unknown> = GridViewRendererComponent;

  /**
   * The grid renders the view's canonical columns, so its `config.gridState` is backed by the
   * canonical `UserView.GridState` store (shared with `MJUserViewEntity.Columns`, the server-side
   * field list, the config panel, and export) — NOT an opaque per-view-type blob. See
   * {@link IViewTypeDescriptor.UsesCanonicalGridState}.
   */
  override readonly UsesCanonicalGridState = true;

  // IsAvailableFor inherits the base "always available" behavior.
}

/** Tree-shaking guard — call from a barrel/module to keep the registration alive. */
export function LoadGridViewType(): void {
  // no-op
}
