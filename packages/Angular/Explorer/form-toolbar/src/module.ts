// Angular
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Markdown
import { MarkdownModule } from '@memberjunction/ng-markdown';

// Kendo UI Angular imports
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { DialogsModule } from '@progress/kendo-angular-dialog';

// MJ
import { RecordChangesModule } from '@memberjunction/ng-record-changes';
import { MemberJunctionSharedModule } from '@memberjunction/ng-shared';
import { ListManagementModule } from '@memberjunction/ng-list-management';

// Local to package
import { FormToolbarComponent } from './lib/form-toolbar';
import { RecordFormContainerComponent } from './lib/record-form-container.component';
import { BaseFormsModule } from '@memberjunction/ng-base-forms';


@NgModule({
  declarations: [
    FormToolbarComponent,
    RecordFormContainerComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    RecordChangesModule,
    BaseFormsModule,
    ButtonsModule,
    InputsModule,
    DialogsModule,
    IndicatorsModule,
    MemberJunctionSharedModule,
    MarkdownModule,
    ListManagementModule
  ],
  exports: [
    FormToolbarComponent,
    RecordFormContainerComponent
  ]
})
export class FormToolbarModule { }