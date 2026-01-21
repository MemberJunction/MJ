/**
 * Kendo UI Modules Bundle
 *
 * Consolidates all Kendo UI Angular modules into a single import.
 * This reduces boilerplate in application module files and provides
 * a consistent set of Kendo UI components across all MemberJunction applications.
 *
 * @example
 * ```typescript
 * import { MJKendoModule } from '@memberjunction/ng-kendo-modules';
 *
 * @NgModule({
 *   imports: [
 *     MJKendoModule,  // ← Replaces 11 individual Kendo imports
 *     // ... other modules
 *   ]
 * })
 * export class AppModule {}
 * ```
 */

import { NgModule } from '@angular/core';

// Import all Kendo UI Angular modules
import { GridModule } from '@progress/kendo-angular-grid';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { IconsModule } from '@progress/kendo-angular-icons';
import { NavigationModule } from '@progress/kendo-angular-navigation';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { LabelModule } from '@progress/kendo-angular-label';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { DialogsModule } from '@progress/kendo-angular-dialog';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { NotificationModule } from '@progress/kendo-angular-notification';

/**
 * MJKendoModule - Consolidated bundle of all Kendo UI Angular modules
 *
 * Re-exports all commonly used Kendo UI modules to reduce boilerplate
 * in application module files.
 *
 * @module MJKendoModule
 */
@NgModule({
  exports: [
    // Grid and Data
    GridModule,

    // Layout and Structure
    LayoutModule,
    IconsModule,
    NavigationModule,

    // Form Controls
    InputsModule,
    DropDownsModule,
    LabelModule,
    ButtonsModule,
    DateInputsModule,

    // Dialogs and Notifications
    DialogsModule,
    NotificationModule
  ]
})
export class MJKendoModule {}
