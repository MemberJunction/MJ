/**
 * NgTrees Module for @memberjunction/ng-trees
 *
 * Provides tree and tree dropdown components for hierarchical entity selection.
 */

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';

// Components
import { TreeComponent } from './tree/tree.component';
import { TreeDropdownComponent } from './tree-dropdown/tree-dropdown.component';

@NgModule({
    declarations: [
        TreeComponent,
        TreeDropdownComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        MJEmptyStateComponent
    ],
    exports: [
        TreeComponent,
        TreeDropdownComponent
    ]
})
export class NgTreesModule { }
