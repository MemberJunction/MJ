import { NgModule } from "@angular/core";
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputsModule, TextBoxModule, TextAreaModule, NumericTextBoxModule, SwitchModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { ButtonsModule, ButtonModule, SplitButtonModule } from '@progress/kendo-angular-buttons';
import { DropDownsModule, ComboBoxModule } from '@progress/kendo-angular-dropdowns';
import { LayoutModule, ExpansionPanelModule, TabStripModule } from '@progress/kendo-angular-layout';
import { DialogsModule } from '@progress/kendo-angular-dialog';
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
import { AIPromptExecutionDialogComponent } from "./AIPrompts/ai-prompt-execution-dialog.component";
import { AIPromptFormComponentExtended, LoadAIPromptFormComponentExtended } from "./AIPrompts/ai-prompt-form.component";
import { AIAgentFormComponentExtended, LoadAIAgentFormComponentExtended } from "./AIAgents/ai-agent-form.component";
import { AIAgentTestHarnessComponent } from "./AIAgents/ai-agent-test-harness-old.component";
import { AIPromptTestHarnessComponent } from "./AIPrompts/ai-prompt-test-harness-old.component";
import { AIAgentTestHarnessComponent as AIAgentTestHarnessComponentNew } from "./AIAgents/ai-agent-test-harness.component";
import { AIPromptTestHarnessComponent as AIPromptTestHarnessComponentNew } from "./AIPrompts/ai-prompt-test-harness.component";
import { AIAgentTestHarnessDialogComponent } from "./AIAgents/ai-agent-test-harness-dialog-old.component";
import { AIPromptTestHarnessDialogComponent } from "./AIPrompts/ai-prompt-test-harness-dialog-old.component";
import { TestHarnessDialogService } from "./test-harness-dialog.service";
import { JoinGridModule } from "@memberjunction/ng-join-grid";
import { CodeEditorModule } from "@memberjunction/ng-code-editor";
import { TreeViewModule } from '@progress/kendo-angular-treeview';

@NgModule({
    declarations: [
        EntityFormExtendedComponent,
        EntityActionExtendedFormComponent,
        ActionTopComponentExtended,
        TemplatesFormExtendedComponent,
        TemplateParamDialogComponent,
        TemplateEditorComponent,
        AIPromptExecutionDialogComponent,
        AIPromptFormComponentExtended,
        AIAgentFormComponentExtended,
        AIAgentTestHarnessComponent,
        AIPromptTestHarnessComponent,
        AIAgentTestHarnessComponentNew,
        AIPromptTestHarnessComponentNew,
        AIAgentTestHarnessDialogComponent,
        AIPromptTestHarnessDialogComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        LayoutModule,
        ExpansionPanelModule,
        TabStripModule,
        DialogsModule,
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
        AIAgentTestHarnessComponent,
        AIPromptTestHarnessComponent,
        AIAgentTestHarnessComponentNew,
        AIPromptTestHarnessComponentNew,
        AIAgentTestHarnessDialogComponent,
        AIPromptTestHarnessDialogComponent
    ],
    providers: [
        TestHarnessDialogService
    ]
})
export class MemberJunctionCoreEntityFormsModule { }

export function LoadCoreCustomForms() {
    LoadEntitiesFormComponent()
    LoadActionExtendedTopComponent();
    LoadEntityActionExtendedFormComponent();
    LoadTemplatesFormExtendedComponent();
    LoadAIPromptFormComponentExtended();
    LoadAIAgentFormComponentExtended();
}