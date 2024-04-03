import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Kendo UI Angular imports
import { ButtonsModule } from '@progress/kendo-angular-buttons';

import { RecordChangesModule } from '@memberjunction/ng-record-changes';
import { MJTabStripModule } from '@memberjunction/ng-tabstrip';

import { SectionLoaderComponent } from './lib/section-loader-component';
import { FormToolbarComponent } from './lib/form-toolbar';


@NgModule({
  declarations: [
    SectionLoaderComponent,
    FormToolbarComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    MJTabStripModule,
    RecordChangesModule,
    ButtonsModule
  ],
  exports: [
    SectionLoaderComponent,
    FormToolbarComponent
  ]
})
export class BaseFormsModule { }