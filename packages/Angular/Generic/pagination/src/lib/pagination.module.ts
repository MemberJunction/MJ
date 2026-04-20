import { NgModule } from '@angular/core';
import { PaginationComponent } from './pagination.component';

/**
 * PaginationModule — convenience NgModule wrapper for the standalone PaginationComponent.
 *
 * Import this module if your consuming module uses NgModule-declared components.
 * Alternatively, import `PaginationComponent` directly into standalone components.
 */
@NgModule({
    imports: [PaginationComponent],
    exports: [PaginationComponent]
})
export class PaginationModule { }
