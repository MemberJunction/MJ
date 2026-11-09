import { Type } from '@angular/core';
import { EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseViewTypeDescriptor } from '../view-type.contracts';
import { CalendarViewRendererComponent } from '../renderers/calendar-view-renderer.component';
import { CalendarViewPropSheetComponent } from '../renderers/calendar-view-prop-sheet.component';
import { IsCalendarDateField } from '../renderers/calendar-placement';

/**
 * Calendar view type — places records on a day, week or month layout by a start field and an
 * optional end field. Available for any entity with a date field of its own; the `__mj_` timestamps
 * every entity carries don't count.
 *
 * Registration key (`DriverClass`) matches the `MJ: View Types` metadata seed:
 * `metadata/view-types/.view-types.json` → "CalendarViewType".
 */
@RegisterClass(BaseViewTypeDescriptor, 'CalendarViewType')
export class CalendarViewType extends BaseViewTypeDescriptor {
  readonly Name = 'CalendarViewType';
  readonly DisplayName = 'Calendar';
  readonly Icon = 'fa-solid fa-calendar-days';
  readonly RendererComponent: Type<unknown> = CalendarViewRendererComponent;
  override readonly PropSheetComponent: Type<unknown> = CalendarViewPropSheetComponent;

  override IsAvailableFor(entity: EntityInfo, _provider?: IMetadataProvider): boolean {
    return !!entity && entity.Fields.some(IsCalendarDateField);
  }
}

/** Tree-shaking guard — call from a barrel/module to keep the registration alive. */
export function LoadCalendarViewType(): void {
  // no-op
}
