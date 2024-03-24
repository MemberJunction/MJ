import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports

import { FormsModule } from '@angular/forms';
import { TabStripModule } from '@progress/kendo-angular-layout';
import { SectionLoaderComponent } from './lib/section-loader-component';
import { FormToolbarComponent } from './lib/form-toolbar';
import { RecordChangesModule } from '@memberjunction/ng-record-changes';
import { ButtonsModule } from '@progress/kendo-angular-buttons';

@NgModule({
  declarations: [
    SectionLoaderComponent,
    FormToolbarComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    TabStripModule,
    RecordChangesModule,
    ButtonsModule
  ],
  exports: [
    SectionLoaderComponent,
    FormToolbarComponent
  ]
})
export class BaseFormsModule { }