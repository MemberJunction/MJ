import { Type } from '@angular/core';
import { EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MapViewComponent } from '@memberjunction/ng-map-view';
import { BaseViewTypeDescriptor } from '../view-type.contracts';

/**
 * Map view type — renders geocoded records as markers on an interactive map. Available
 * only for entities that support geocoding (lifted from the host's `updateGeoCodingSupport`
 * logic, which checks `entity.SupportsGeoCoding`).
 *
 * Registration key (`DriverClass`) matches the `MJ: View Types` metadata seed:
 * `metadata/view-types/.view-types.json` → "MapViewType".
 */
@RegisterClass(BaseViewTypeDescriptor, 'MapViewType')
export class MapViewType extends BaseViewTypeDescriptor {
  readonly Name = 'MapViewType';
  readonly DisplayName = 'Map';
  readonly Icon = 'fa-solid fa-map-location-dot';
  readonly RendererComponent: Type<unknown> = MapViewComponent;

  override IsAvailableFor(entity: EntityInfo, _provider?: IMetadataProvider): boolean {
    return !!(entity && entity.SupportsGeoCoding);
  }
}

/** Tree-shaking guard — call from a barrel/module to keep the registration alive. */
export function LoadMapViewType(): void {
  // no-op
}
