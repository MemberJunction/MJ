import { NgModule } from "@angular/core";
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputsModule, TextBoxModule, TextAreaModule, NumericTextBoxModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { ButtonsModule, ButtonModule } from '@progress/kendo-angular-buttons';
import { DropDownsModule, ComboBoxModule } from '@progress/kendo-angular-dropdowns';
import { LayoutModule, ExpansionPanelModule } from '@progress/kendo-angular-layout';
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
import { AIAgentExecutionDialogComponent } from "./AIAgents/ai-agent-execution-dialog.component";
import { AIAgentFormComponentExtended, LoadAIAgentFormComponentExtended } from "./AIAgents/ai-agent-form.component";
import { JoinGridModule } from "@memberjunction/ng-join-grid";
import { CodeEditorModule } from "@memberjunction/ng-code-editor";

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
        AIAgentExecutionDialogComponent,
        AIAgentFormComponentExtended
    ],
    imports: [
        CommonModule,
        FormsModule,
        LayoutModule,
        ExpansionPanelModule,
        DialogsModule,
        InputsModule,
        TextBoxModule,
        TextAreaModule,
        NumericTextBoxModule,
        DropDownsModule,
        ComboBoxModule,
        ButtonsModule,
        ButtonModule,
        DateInputsModule,
        UserViewGridModule,
        LinkDirectivesModule,
        JoinGridModule,
        BaseFormsModule,
        FormToolbarModule,
        MJTabStripModule,
        ContainerDirectivesModule,
        CodeEditorModule
    ],
    exports: [
        EntityFormExtendedComponent,
        ActionTopComponentExtended,
        EntityActionExtendedFormComponent,
        TemplatesFormExtendedComponent,
        TemplateEditorComponent,
        AIPromptFormComponentExtended,
        AIAgentFormComponentExtended
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