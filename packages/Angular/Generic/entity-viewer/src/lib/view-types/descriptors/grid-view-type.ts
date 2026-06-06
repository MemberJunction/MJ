import { Type } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseViewTypeDescriptor } from '../view-type.contracts';
import { EntityDataGridComponent } from '../../entity-data-grid/entity-data-grid.component';

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
  readonly RendererComponent: Type<unknown> = EntityDataGridComponent;

  // IsAvailableFor inherits the base "always available" behavior.
}

/** Tree-shaking guard — call from a barrel/module to keep the registration alive. */
export function LoadGridViewType(): void {
  // no-op
}
