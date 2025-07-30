import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Kendo UI Modules
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { DialogsModule, WindowModule } from '@progress/kendo-angular-dialog';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { NotificationModule } from '@progress/kendo-angular-notification';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { TooltipsModule } from '@progress/kendo-angular-tooltip';
import { IconsModule } from '@progress/kendo-angular-icons';

// MemberJunction imports
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';


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
import { TestHarnessWindowService } from './lib/test-harness-window.service';
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
    // Kendo UI
    ButtonsModule,
    DialogsModule,
    WindowModule,
    DropDownsModule,
    InputsModule,
    LayoutModule,
    NotificationModule,
    IndicatorsModule,
    TooltipsModule,
    IconsModule,
    // MemberJunction
    ContainerDirectivesModule,
    CodeEditorModule
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
    TestHarnessWindowService,
    TestHarnessWindowManagerService,
    WindowDockService
  ]
})
export class AITestHarnessModule { }