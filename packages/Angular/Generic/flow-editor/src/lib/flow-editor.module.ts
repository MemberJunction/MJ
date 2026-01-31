import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FFlowModule } from '@foblex/flow';

// Generic components
import { FlowEditorComponent } from './components/flow-editor.component';
import { FlowNodeComponent } from './components/flow-node.component';
import { FlowPaletteComponent } from './components/flow-palette.component';
import { FlowToolbarComponent } from './components/flow-toolbar.component';
import { FlowStatusBarComponent } from './components/flow-status-bar.component';

// Agent-specific components
import { FlowAgentEditorComponent } from './agent-editor/flow-agent-editor.component';
import { AgentPropertiesPanelComponent } from './agent-editor/agent-properties-panel.component';
import { AgentStepListComponent } from './agent-editor/agent-step-list.component';

@NgModule({
  declarations: [
    // Generic
    FlowEditorComponent,
    FlowNodeComponent,
    FlowPaletteComponent,
    FlowToolbarComponent,
    FlowStatusBarComponent,
    // Agent-specific
    FlowAgentEditorComponent,
    AgentPropertiesPanelComponent,
    AgentStepListComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    FFlowModule
  ],
  exports: [
    // Generic — for any consumer
    FlowEditorComponent,
    FlowNodeComponent,
    FlowPaletteComponent,
    FlowToolbarComponent,
    FlowStatusBarComponent,
    // Agent-specific
    FlowAgentEditorComponent,
    AgentPropertiesPanelComponent,
    AgentStepListComponent
  ]
})
export class FlowEditorModule { }

/** Prevents tree-shaking of the module and its components */
export function LoadFlowEditorModule(): void {
  // Intentionally empty — ensures module is included in the bundle
}
