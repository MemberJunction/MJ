/**
 * @fileoverview Angular module for the MJ Timeline component.
 *
 * This module provides a rich, responsive timeline component that works with
 * both MemberJunction BaseEntity objects and plain JavaScript objects.
 *
 * @module @memberjunction/ng-timeline
 */

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TimelineComponent } from './component/timeline.component';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';

/**
 * Angular module that provides the MJ Timeline component.
 *
 * @example
 * ```typescript
 * import { TimelineModule } from '@memberjunction/ng-timeline';
 *
 * @NgModule({
 *   imports: [TimelineModule]
 * })
 * export class MyModule { }
 * ```
 */
@NgModule({
  declarations: [
    TimelineComponent
  ],
  imports: [
    CommonModule,
    MJEmptyStateComponent
  ],
  exports: [
    TimelineComponent
  ]
})
export class TimelineModule { }
