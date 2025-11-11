import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Kendo UI modules
import { DialogModule } from '@progress/kendo-angular-dialog';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';

// Components
import { TestFeedbackDialogComponent } from './components/test-feedback-dialog.component';

@NgModule({
  declarations: [
    TestFeedbackDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DialogModule,
    ButtonsModule,
    InputsModule,
    DropDownsModule
  ],
  exports: [
    TestFeedbackDialogComponent
  ]
})
export class TestingModule { }
