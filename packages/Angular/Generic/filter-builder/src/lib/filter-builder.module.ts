import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { FilterBuilderComponent } from './filter-builder/filter-builder.component';
import { FilterGroupComponent } from './filter-group/filter-group.component';
import { FilterRuleComponent } from './filter-rule/filter-rule.component';

/**
 * FilterBuilderModule
 *
 * Provides a complete filter builder UI for creating complex
 * boolean filter expressions. Outputs Kendo-compatible
 * CompositeFilterDescriptor JSON format.
 *
 * @example
 * ```typescript
 * import { FilterBuilderModule } from '@memberjunction/ng-filter-builder';
 *
 * @NgModule({
 *   imports: [FilterBuilderModule],
 *   // ...
 * })
 * export class MyModule {}
 * ```
 *
 * @example
 * ```html
 * <mj-filter-builder
 *   [fields]="filterFields"
 *   [filter]="currentFilter"
 *   (filterChange)="onFilterChange($event)">
 * </mj-filter-builder>
 * ```
 */
@NgModule({
  declarations: [
    FilterBuilderComponent,
    FilterGroupComponent,
    FilterRuleComponent
  ],
  imports: [
    CommonModule,
    FormsModule
  ],
  exports: [
    FilterBuilderComponent,
    FilterGroupComponent,
    FilterRuleComponent
  ]
})
export class FilterBuilderModule {}
