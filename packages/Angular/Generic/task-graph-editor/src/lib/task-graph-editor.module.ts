import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FlowEditorModule } from '@memberjunction/ng-flow-editor';
import { MJEmptyStateComponent, MJAlertComponent } from '@memberjunction/ng-ui-components';

import { TaskGraphEditorComponent } from './task-graph-editor.component';

@NgModule({
  declarations: [TaskGraphEditorComponent],
  imports: [CommonModule, FormsModule, FlowEditorModule, MJEmptyStateComponent, MJAlertComponent],
  exports: [TaskGraphEditorComponent],
})
export class TaskGraphEditorModule {}
