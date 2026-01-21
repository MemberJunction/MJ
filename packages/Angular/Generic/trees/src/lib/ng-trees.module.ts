/**
 * NgTrees Module for @memberjunction/ng-trees
 *
 * Provides tree and tree dropdown components for hierarchical entity selection.
 */

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Components
import { TreeComponent } from './tree/tree.component';
import { TreeDropdownComponent } from './tree-dropdown/tree-dropdown.component';

/**
 * Prevents tree-shaking of the NgTrees module.
 * Import this in your application's module to ensure components are available.
 */
export function LoadNgTreesModule() {
    // This function exists to prevent tree-shaking
}

@NgModule({
    declarations: [
        TreeComponent,
        TreeDropdownComponent
    ],
    imports: [
        CommonModule,
        FormsModule
    ],
    exports: [
        TreeComponent,
        TreeDropdownComponent
    ]
})
export class NgTreesModule { }
