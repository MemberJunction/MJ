import { NgModule } from '@angular/core';
import { DataPagerComponent } from './data-pager.component';

/**
 * DataPagerModule — convenience NgModule wrapper for the standalone DataPagerComponent.
 *
 * Import this module if your consuming module uses NgModule-declared components.
 * Alternatively, import `DataPagerComponent` directly into standalone components.
 */
@NgModule({
    imports: [DataPagerComponent],
    exports: [DataPagerComponent]
})
export class DataPagerModule { }
