/**
 * @fileoverview Angular module for React component integration in MemberJunction.
 * Provides components and services for hosting React components within Angular applications.
 * @module @memberjunction/ng-react
 */

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Components
import { MJReactComponent } from './components/mj-react-component.component';

// Services
import { ScriptLoaderService } from './services/script-loader.service';
import { ReactBridgeService } from './services/react-bridge.service';
import { AngularAdapterService } from './services/angular-adapter.service';

/**
 * Angular module that provides React component hosting capabilities.
 * Import this module to use React components within your Angular application.
 * 
 * @example
 * ```typescript
 * import { MJReactModule } from '@memberjunction/ng-react';
 * 
 * @NgModule({
 *   imports: [MJReactModule]
 * })
 * export class MyModule {}
 * ```
 */
@NgModule({
  declarations: [
    MJReactComponent
  ],
  imports: [
    CommonModule
  ],
  providers: [
    ScriptLoaderService,
    ReactBridgeService,
    AngularAdapterService
  ],
  exports: [
    MJReactComponent
  ]
})
export class MJReactModule { }