import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FlowEditorModule } from '@memberjunction/ng-flow-editor';
import { MJEmptyStateComponent, MJAlertComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';

import { TaskGraphEditorComponent } from './task-graph-editor.component';
import { TaskGraphPropertiesPanelComponent } from './task-graph-properties-panel.component';

@NgModule({
  declarations: [TaskGraphEditorComponent, TaskGraphPropertiesPanelComponent],
  imports: [CommonModule, FormsModule, FlowEditorModule, MJEmptyStateComponent, MJAlertComponent, MJButtonDirective],
  exports: [TaskGraphEditorComponent, TaskGraphPropertiesPanelComponent],
})
export class TaskGraphEditorModule {}
