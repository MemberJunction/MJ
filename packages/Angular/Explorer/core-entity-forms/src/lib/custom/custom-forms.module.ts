import { NgModule } from "@angular/core";
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputsModule, TextBoxModule, TextAreaModule, NumericTextBoxModule, SwitchModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { ButtonsModule, ButtonModule, SplitButtonModule } from '@progress/kendo-angular-buttons';
import { DropDownsModule, ComboBoxModule } from '@progress/kendo-angular-dropdowns';
import { LayoutModule, ExpansionPanelModule, TabStripModule, SplitterModule } from '@progress/kendo-angular-layout';
import { DialogsModule, WindowModule } from '@progress/kendo-angular-dialog';
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { FormToolbarModule } from '@memberjunction/ng-form-toolbar';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';
import { EntityFormExtendedComponent, LoadEntitiesFormComponent } from "./Entities/entities-form.component";
import { MJTabStripModule } from "@memberjunction/ng-tabstrip";
import { ContainerDirectivesModule } from "@memberjunction/ng-container-directives";
import { ActionTopComponentExtended, LoadActionExtendedTopComponent } from "./Actions/actions-top-area-extended";
import { EntityActionExtendedFormComponent, LoadEntityActionExtendedFormComponent } from "./EntityActions/entityaction.form.component";
import { TemplatesFormExtendedComponent, LoadTemplatesFormExtendedComponent } from "./Templates/templates-form.component";
import { TemplateParamDialogComponent } from "./Templates/template-param-dialog.component";
import { TemplateEditorComponent } from "../shared/components/template-editor.component";
import { AIPromptFormComponentExtended, LoadAIPromptFormComponentExtended } from "./AIPrompts/ai-prompt-form.component";
import { AIAgentFormComponentExtended, LoadAIAgentFormComponentExtended } from "./AIAgents/ai-agent-form.component";
import { AITestHarnessComponent } from "./ai-test-harness/ai-test-harness.component";
import { AITestHarnessDialogComponent } from "./ai-test-harness/ai-test-harness-dialog.component";
import { TestHarnessDialogService } from "./test-harness-dialog.service";
import { JoinGridModule } from "@memberjunction/ng-join-grid";
import { CodeEditorModule } from "@memberjunction/ng-code-editor";
import { TreeViewModule } from '@progress/kendo-angular-treeview';
import { EntitySelectorDialogComponent } from "./shared/entity-selector-dialog.component";
import { AIPromptRunFormComponentExtended } from "./AIPromptRuns/ai-prompt-run-form.component";
import { ActionFormComponentExtended, LoadActionFormComponentExtended } from "./Actions/action-form.component";
import { ActionTestHarnessComponent } from "./Actions/action-test-harness.component";
import { ActionTestHarnessDialogComponent } from "./Actions/action-test-harness-dialog.component";
import { ActionExecutionLogFormComponentExtended } from "./Actions/action-execution-log-form.component";
import { ActionParamDialogComponent } from "./Actions/action-param-dialog.component";
import { AgentExecutionMonitorComponent } from "./ai-test-harness/agent-execution-monitor.component";
import { ExecutionNodeComponent } from "./ai-test-harness/agent-execution-node.component";

@NgModule({
    declarations: [
        EntityFormExtendedComponent,
        EntityActionExtendedFormComponent,
        ActionTopComponentExtended,
        TemplatesFormExtendedComponent,
        TemplateParamDialogComponent,
        TemplateEditorComponent,
        AIPromptFormComponentExtended,
        AIAgentFormComponentExtended,
        AITestHarnessComponent,
        EntitySelectorDialogComponent,
        AITestHarnessDialogComponent,
        AIPromptRunFormComponentExtended,
        ActionFormComponentExtended,
        ActionTestHarnessComponent,
        ActionTestHarnessDialogComponent,
        ActionExecutionLogFormComponentExtended,
        ActionParamDialogComponent,
    ],
    imports: [
        CommonModule,
        AgentExecutionMonitorComponent,
        ExecutionNodeComponent,
        FormsModule,
        LayoutModule,
        ExpansionPanelModule,
        TabStripModule,
        SplitterModule,
        DialogsModule,
        WindowModule,
        InputsModule,
        TextBoxModule,
        TextAreaModule,
        NumericTextBoxModule,
        SwitchModule,
        DropDownsModule,
        ComboBoxModule,
        ButtonsModule,
        ButtonModule,
        SplitButtonModule,
        DateInputsModule,
        UserViewGridModule,
        LinkDirectivesModule,
        JoinGridModule,
        BaseFormsModule,
        FormToolbarModule,
        MJTabStripModule,
        ContainerDirectivesModule,
        CodeEditorModule,
        TreeViewModule
    ],
    exports: [
        EntityFormExtendedComponent,
        ActionTopComponentExtended,
        EntityActionExtendedFormComponent,
        TemplatesFormExtendedComponent,
        TemplateEditorComponent,
        AIPromptFormComponentExtended,
        AIAgentFormComponentExtended,
        AITestHarnessComponent,
        AITestHarnessDialogComponent,
        AIPromptRunFormComponentExtended,
        ActionFormComponentExtended,
        ActionTestHarnessComponent,
        ActionTestHarnessDialogComponent,
        ActionExecutionLogFormComponentExtended,
        ExecutionNodeComponent,
    ],
    providers: [
        TestHarnessDialogService
    ]
})
export class MemberJunctionCoreEntityFormsModule { }

// Loader function for ActionExecutionLogFormComponentExtended
export function LoadActionExecutionLogFormComponentExtended() {
    // This function is called to ensure the form is loaded
}

export function LoadCoreCustomForms() {
    LoadEntitiesFormComponent()
    LoadActionExtendedTopComponent();
    LoadEntityActionExtendedFormComponent();
    LoadTemplatesFormExtendedComponent();
    LoadAIPromptFormComponentExtended();
    LoadAIAgentFormComponentExtended();
    LoadActionExecutionLogFormComponentExtended();
    LoadActionFormComponentExtended();
}