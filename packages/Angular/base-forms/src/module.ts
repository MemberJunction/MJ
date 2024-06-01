import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Kendo UI Angular imports
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { DialogsModule } from '@progress/kendo-angular-dialog';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

import { RecordChangesModule } from '@memberjunction/ng-record-changes';
import { MJTabStripModule } from '@memberjunction/ng-tabstrip';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';
import { AskSkipModule } from '@memberjunction/ng-ask-skip';

import { SectionLoaderComponent } from './lib/section-loader-component';
import { MJFormField } from './lib/base-field-component';
import { CreateRecordComponent } from './lib/create-record/create-record.component';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { MemberJunctionSharedModule } from '@memberjunction/ng-shared';

// Markdown
import { MarkdownModule } from 'ngx-markdown';

@NgModule({
  declarations: [
    SectionLoaderComponent,
    MJFormField,
    CreateRecordComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    MJTabStripModule,
    RecordChangesModule,
    ButtonsModule,
    InputsModule,
    DateInputsModule,
    DropDownsModule,
    LinkDirectivesModule,
    AskSkipModule,
    DialogsModule,
    IndicatorsModule,
    ContainerDirectivesModule,
    MemberJunctionSharedModule,
    MarkdownModule.forRoot()
  ],
  exports: [
    SectionLoaderComponent,
    MJFormField,
    CreateRecordComponent
  ]
})
export class BaseFormsModule { }