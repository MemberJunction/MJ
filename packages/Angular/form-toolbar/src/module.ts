// Angular
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Markdown
import { MarkdownModule } from 'ngx-markdown';

// Kendo UI Angular imports
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { DialogsModule } from '@progress/kendo-angular-dialog';

// MJ
import { RecordChangesModule } from '@memberjunction/ng-record-changes';
import { AskSkipModule } from '@memberjunction/ng-ask-skip';
import { MemberJunctionSharedModule } from '@memberjunction/ng-shared';

// Local to package
import { FormToolbarComponent } from './lib/form-toolbar';
import { BaseFormsModule } from '@memberjunction/ng-base-forms';


@NgModule({
  declarations: [
    FormToolbarComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    RecordChangesModule,
    BaseFormsModule,
    ButtonsModule,
    InputsModule,
    DialogsModule,
    AskSkipModule,
    IndicatorsModule,
    MemberJunctionSharedModule,
    MarkdownModule.forRoot()
  ],
  exports: [
    FormToolbarComponent,
  ]
})
export class FormToolbarModule { }