import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// MJ UI Components
import {
  MJWindowComponent, MJWindowTitlebarComponent,
  MJButtonDirective,
  MJDropdownComponent,
  MJNumericInputComponent,
  MJSwitchComponent,
  MJAccordionPanelComponent,
  MJDialogComponent, MJDialogTitlebarComponent, MJDialogActionsComponent,
  MJEmptyStateComponent
} from '@memberjunction/ng-ui-components';
import { AngularSplitModule } from 'angular-split';

// MemberJunction imports
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';


// Components
import { AITestHarnessComponent } from './lib/ai-test-harness.component';
import { AITestHarnessDialogComponent } from './lib/ai-test-harness-dialog.component';
import { AITestHarnessWindowComponent } from './lib/ai-test-harness-window.component';
import { TestHarnessCustomWindowComponent } from './lib/test-harness-custom-window.component';
import { AgentExecutionMonitorComponent } from './lib/agent-execution-monitor.component';
import { ExecutionNodeComponent } from './lib/agent-execution-node.component';
import { JsonViewerWindowComponent } from './lib/json-viewer-window.component';
import { WindowDockService } from './lib/window-dock.service';

// Services
import { AITestHarnessDialogService } from './lib/ai-test-harness-dialog.service';
import { TestHarnessWindowManagerService } from './lib/test-harness-window-manager.service';

@NgModule({
  declarations: [
    AITestHarnessComponent,
    AITestHarnessDialogComponent,
    AITestHarnessWindowComponent,
    TestHarnessCustomWindowComponent,
    JsonViewerWindowComponent,
    AgentExecutionMonitorComponent,
    ExecutionNodeComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    // MJ UI Components
    MJWindowComponent,
    MJWindowTitlebarComponent,
    MJButtonDirective,
    MJDropdownComponent,
    MJNumericInputComponent,
    MJSwitchComponent,
    MJAccordionPanelComponent,
    MJDialogComponent,
    MJDialogTitlebarComponent,
    MJDialogActionsComponent,
    MJEmptyStateComponent,
    AngularSplitModule,
    // MemberJunction
    ContainerDirectivesModule,
    CodeEditorModule,
    SharedGenericModule
  ],
  exports: [
    AITestHarnessComponent,
    AITestHarnessDialogComponent,
    AITestHarnessWindowComponent,
    TestHarnessCustomWindowComponent,
    AgentExecutionMonitorComponent,
    JsonViewerWindowComponent
  ],
  providers: [
    AITestHarnessDialogService,
    TestHarnessWindowManagerService,
    WindowDockService
  ]
})
export class AITestHarnessModule { }
