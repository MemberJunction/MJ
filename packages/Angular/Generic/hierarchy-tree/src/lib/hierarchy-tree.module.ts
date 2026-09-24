import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HierarchyTreeComponent } from './components/hierarchy-tree.component';

/**
 * NgModule wrapper for `@memberjunction/ng-hierarchy-tree`.
 * For standalone usage, consumers can import `HierarchyTreeComponent` directly.
 */
@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        HierarchyTreeComponent
    ],
    exports: [
        HierarchyTreeComponent
    ]
})
export class HierarchyTreeModule {}
