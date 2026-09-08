import { Type } from '@angular/core';
import { EntityHasMapCoordinates, EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseViewTypeDescriptor } from '../view-type.contracts';
import { MapViewRendererComponent } from '../renderers/map-view-renderer.component';

/**
 * Map view type — renders geocoded records as markers on an interactive map. Available
 * when `SupportsGeoCoding` is on **or** the entity has GeoLatitude/GeoLongitude (including
 * virtual display fields such as PrimaryAddressLatitude). GeoCodeSyncService is a separate
 * write-side gate (writable Geo* only).
 *
 * Registration key (`DriverClass`) matches the `MJ: View Types` metadata seed:
 * `metadata/view-types/.view-types.json` → "MapViewType".
 */
@RegisterClass(BaseViewTypeDescriptor, 'MapViewType')
export class MapViewType extends BaseViewTypeDescriptor {
  readonly Name = 'MapViewType';
  readonly DisplayName = 'Map';
  readonly Icon = 'fa-solid fa-map-location-dot';
  readonly RendererComponent: Type<unknown> = MapViewRendererComponent;

  override IsAvailableFor(entity: EntityInfo, _provider?: IMetadataProvider): boolean {
    return !!(entity && EntityHasMapCoordinates(entity));
  }
}

/** Tree-shaking guard — call from a barrel/module to keep the registration alive. */
export function LoadMapViewType(): void {
  // no-op
}
