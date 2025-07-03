import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { DeepDiffDialogComponent } from './deep-diff-dialog.component';
import { DeepDiffComponent } from './deep-diff.component';

@NgModule({
  declarations: [
    DeepDiffComponent,
    DeepDiffDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule
  ],
  exports: [
    DeepDiffComponent,
    DeepDiffDialogComponent
  ]
})
export class DeepDiffModule { }