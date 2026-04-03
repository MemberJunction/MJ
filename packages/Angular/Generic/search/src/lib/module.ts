import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

import { SearchOverlayComponent } from './search-overlay.component';
import { SearchResultsComponent } from './search-results.component';
import { SearchFilterComponent } from './search-filter.component';

@NgModule({
    declarations: [
        SearchOverlayComponent,
        SearchResultsComponent,
        SearchFilterComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        SharedGenericModule
    ],
    exports: [
        SearchOverlayComponent,
        SearchResultsComponent,
        SearchFilterComponent
    ]
})
export class SearchModule { }
