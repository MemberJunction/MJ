import { Type } from '@angular/core';
import { EntityInfo, EntityFieldTSType, IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { TimelineComponent } from '@memberjunction/ng-timeline';
import { BaseViewTypeDescriptor } from '../view-type.contracts';

/**
 * Timeline view type — plots records along a chronological axis. Available only for
 * entities that expose at least one date field (lifted from the host's `detectDateFields`
 * logic, which considers any field whose `TSType` is `Date`, including `__mj_CreatedAt` /
 * `__mj_UpdatedAt`).
 *
 * Registration key (`DriverClass`) matches the `MJ: View Types` metadata seed:
 * `metadata/view-types/.view-types.json` → "TimelineViewType".
 */
@RegisterClass(BaseViewTypeDescriptor, 'TimelineViewType')
export class TimelineViewType extends BaseViewTypeDescriptor {
  readonly Name = 'TimelineViewType';
  readonly DisplayName = 'Timeline';
  readonly Icon = 'fa-solid fa-timeline';
  readonly RendererComponent: Type<unknown> = TimelineComponent;

  override IsAvailableFor(entity: EntityInfo, _provider?: IMetadataProvider): boolean {
    if (!entity) {
      return false;
    }
    return entity.Fields.some(f => f.TSType === EntityFieldTSType.Date);
  }
}

/** Tree-shaking guard — call from a barrel/module to keep the registration alive. */
export function LoadTimelineViewType(): void {
  // no-op
}
