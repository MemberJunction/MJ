import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

import { SearchOverlayComponent } from './search-overlay.component';
import { SearchResultsComponent } from './search-results.component';
import { SearchFilterComponent } from './search-filter.component';
import { SearchInputComponent } from './search-input.component';
import { SearchSuggestComponent } from './search-suggest.component';
import { SearchCompositeComponent } from './search-composite.component';
import { SearchScopeSelectorComponent } from './search-scope-selector.component';
import { SearchScopeChildGridComponent } from './search-scope-child-grid.component';

@NgModule({
    declarations: [
        SearchOverlayComponent,
        SearchResultsComponent,
        SearchFilterComponent,
        SearchInputComponent,
        SearchSuggestComponent,
        SearchCompositeComponent,
        SearchScopeSelectorComponent,
        SearchScopeChildGridComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        SharedGenericModule
    ],
    exports: [
        SearchOverlayComponent,
        SearchResultsComponent,
        SearchFilterComponent,
        SearchInputComponent,
        SearchSuggestComponent,
        SearchCompositeComponent,
        SearchScopeSelectorComponent,
        SearchScopeChildGridComponent
    ]
})
export class SearchModule { }
