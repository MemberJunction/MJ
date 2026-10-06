import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FlowEditorModule } from '@memberjunction/ng-flow-editor';
import { MJEmptyStateComponent, MJAlertComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import { AngularSplitModule } from 'angular-split';

import { TaskGraphEditorComponent } from './task-graph-editor.component';
import { TaskGraphPropertiesPanelComponent } from './task-graph-properties-panel.component';
import { TaskGraphRunViewComponent } from './task-graph-run-view.component';
import { TaskGraphDebugToolbarComponent } from './task-graph-debug-toolbar.component';
import { TaskGraphVariablesComponent } from './task-graph-variables.component';
import { TaskGraphDebuggerComponent } from './task-graph-debugger.component';

@NgModule({
  declarations: [
    TaskGraphEditorComponent,
    TaskGraphPropertiesPanelComponent,
    TaskGraphRunViewComponent,
    TaskGraphDebuggerComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    FlowEditorModule,
    MJEmptyStateComponent,
    MJAlertComponent,
    MJButtonDirective,
    AngularSplitModule,
    TaskGraphDebugToolbarComponent,
    TaskGraphVariablesComponent,
  ],
  exports: [
    TaskGraphEditorComponent,
    TaskGraphPropertiesPanelComponent,
    TaskGraphRunViewComponent,
    TaskGraphDebugToolbarComponent,
    TaskGraphVariablesComponent,
    TaskGraphDebuggerComponent,
  ],
})
export class TaskGraphEditorModule {}
