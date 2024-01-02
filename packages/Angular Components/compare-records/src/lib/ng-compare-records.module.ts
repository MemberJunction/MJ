import { NgModule } from '@angular/core';
import { CompareRecordsComponent } from './ng-compare-records.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Kendo UI Angular imports
import { GridModule } from '@progress/kendo-angular-grid';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { LabelModule } from '@progress/kendo-angular-label';

@NgModule({
  declarations: [
    CompareRecordsComponent
  ],
  imports: [
    CommonModule,
    GridModule, // Kendo UI Grid module
    InputsModule,
    LabelModule,
    FormsModule
  ],
  exports: [
    CompareRecordsComponent
  ]
})
export class CompareRecordsModule { }
