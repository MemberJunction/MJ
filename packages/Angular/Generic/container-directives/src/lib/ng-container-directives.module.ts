import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FillContainer } from './ng-fill-container-directive';
import { Container } from './ng-container-directive';

/**
 * Angular module for MemberJunction container directives.
 * Provides directives for container management in MemberJunction applications.
 *
 * Includes:
 * - `mjContainer` directive for view container management
 * - `` directive for responsive filling of parent containers
 *
 * @example
 * ```typescript
 * import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
 *
 * @NgModule({
 *   imports: [
 *     ContainerDirectivesModule
 *   ]
 * })
 * export class YourModule { }
 * ```
 */
@NgModule({
  declarations: [
    FillContainer,
    Container
  ],
  imports: [
    CommonModule
  ],
  exports: [
    FillContainer,
    Container
  ]
})
export class ContainerDirectivesModule { }