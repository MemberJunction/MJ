import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MapViewComponent } from './map-view.component';

@NgModule({
    declarations: [MapViewComponent],
    imports: [CommonModule, SharedGenericModule],
    exports: [MapViewComponent]
})
export class MapViewModule {}
