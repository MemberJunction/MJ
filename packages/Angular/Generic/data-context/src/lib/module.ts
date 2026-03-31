import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Kendo UI Angular imports (grid still uses Kendo)
import { GridModule } from '@progress/kendo-angular-grid';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

// MJ UI Components
import { MjButtonDirective, MjWindowComponent, MjWindowTitlebarComponent } from '@memberjunction/ng-ui-components';

import { DataContextComponent } from './ng-data-context.component';
import { DataContextDialogComponent } from './ng-data-context-dialog.component';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

@NgModule({
  declarations: [
    DataContextComponent,
    DataContextDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    GridModule,
    IndicatorsModule,
    MjButtonDirective,
    MjWindowComponent,
    MjWindowTitlebarComponent,
    ContainerDirectivesModule,
    SharedGenericModule
  ],
  exports: [
    DataContextComponent,
    DataContextDialogComponent
  ]
})
export class DataContextModule { }