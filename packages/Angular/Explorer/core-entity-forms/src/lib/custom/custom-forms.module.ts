import { NgModule } from "@angular/core";
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InputsModule, TextBoxModule, TextAreaModule, NumericTextBoxModule, SwitchModule, CheckBoxModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { ButtonsModule, ButtonModule, SplitButtonModule } from '@progress/kendo-angular-buttons';
import { DropDownsModule, ComboBoxModule, DropDownTreesModule, DropDownListModule } from '@progress/kendo-angular-dropdowns';
import { LayoutModule, ExpansionPanelModule, TabStripModule, SplitterModule, PanelBarModule } from '@progress/kendo-angular-layout';
import { DialogsModule, WindowModule } from '@progress/kendo-angular-dialog';
import { GridModule } from '@progress/kendo-angular-grid';
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
import { TemplateParamsGridComponent } from "./Templates/template-params-grid.component";
import { TemplateEditorComponent } from "../shared/components/template-editor.component";
import { AIPromptFormComponentExtended, LoadAIPromptFormComponentExtended } from "./AIPrompts/ai-prompt-form.component";
import { AIAgentFormComponentExtended, LoadAIAgentFormComponentExtended } from "./AIAgents/ai-agent-form.component";
import { NewAgentDialogComponent } from "./AIAgents/new-agent-dialog.component";
import { NewAgentDialogService } from "./AIAgents/new-agent-dialog.service";
import { AddActionDialogComponent } from "./AIAgents/add-action-dialog.component";
import { PromptSelectorDialogComponent } from "./AIAgents/prompt-selector-dialog.component";
import { AgentPromptAdvancedSettingsDialogComponent } from "./AIAgents/agent-prompt-advanced-settings-dialog.component";
import { SubAgentAdvancedSettingsDialogComponent } from "./AIAgents/sub-agent-advanced-settings-dialog.component";
import { SubAgentSelectorDialogComponent } from "./AIAgents/sub-agent-selector-dialog.component";
import { CreatePromptDialogComponent } from "./AIAgents/create-prompt-dialog.component";
import { CreateSubAgentDialogComponent } from "./AIAgents/create-sub-agent-dialog.component";
import { AIAgentManagementService } from "./AIAgents/ai-agent-management.service";
import { AITestHarnessModule } from "@memberjunction/ng-ai-test-harness";
import { ActionGalleryModule } from "@memberjunction/ng-action-gallery";
import { JoinGridModule } from "@memberjunction/ng-join-grid";
import { CodeEditorModule } from "@memberjunction/ng-code-editor";
import { DeepDiffModule } from "@memberjunction/ng-deep-diff";
import { TreeViewModule } from '@progress/kendo-angular-treeview';
import { EntitySelectorDialogComponent } from "./shared/entity-selector-dialog.component";
import { AIPromptRunFormComponentExtended } from "./AIPromptRuns/ai-prompt-run-form.component";
import { ChatMessageViewerComponent } from "./AIPromptRuns/chat-message-viewer.component";
import { ActionFormComponentExtended, LoadActionFormComponentExtended } from "./Actions/action-form.component";
import { ActionTestHarnessComponent } from "./Actions/action-test-harness.component";
import { ActionTestHarnessDialogComponent } from "./Actions/action-test-harness-dialog.component";
import { ActionExecutionLogFormComponentExtended, LoadActionExecutionLogFormComponentExtended } from "./Actions/action-execution-log-form.component";
import { ActionParamDialogComponent } from "./Actions/action-param-dialog.component";
import { AIAgentRunFormComponentExtended, LoadAIAgentRunFormComponent } from "./ai-agent-run/ai-agent-run.component";
import { AIAgentRunTimelineComponent } from "./ai-agent-run/ai-agent-run-timeline.component";
import { AIAgentRunStepNodeComponent } from "./ai-agent-run/ai-agent-run-step-node.component";
import { AIAgentRunAnalyticsComponent } from "./ai-agent-run/ai-agent-run-analytics.component";
import { AIAgentRunVisualizationComponent } from "./ai-agent-run/ai-agent-run-visualization.component";
import { AIAgentRunStepDetailComponent } from "./ai-agent-run/ai-agent-run-step-detail.component";
import { QueryFormExtendedComponent, LoadQueryFormExtendedComponent } from "./Queries/query-form.component";
import { QueryRunDialogComponent } from "./Queries/query-run-dialog.component";
import { QueryCategoryDialogComponent } from "./Queries/query-category-dialog.component";
import { FlowAgentFormSectionComponent } from "./AIAgents/FlowAgentType/flow-agent-form-section.component";
import { StepInfoControlComponent } from "./AIAgents/FlowAgentType/step-info-control.component";
import { FlowAgentDiagramComponent } from "./AIAgents/FlowAgentType/flow-agent-diagram.component";

@NgModule({
    declarations: [
        EntityFormExtendedComponent,
        EntityActionExtendedFormComponent,
        ActionTopComponentExtended,
        TemplatesFormExtendedComponent,
        TemplateParamDialogComponent,
        TemplateParamsGridComponent,
        TemplateEditorComponent,
        AIPromptFormComponentExtended,
        AIAgentFormComponentExtended,
        NewAgentDialogComponent,
        AddActionDialogComponent,
        PromptSelectorDialogComponent,
        AgentPromptAdvancedSettingsDialogComponent,
        SubAgentAdvancedSettingsDialogComponent,
        SubAgentSelectorDialogComponent,
        CreatePromptDialogComponent,
        CreateSubAgentDialogComponent,
        EntitySelectorDialogComponent,
        AIPromptRunFormComponentExtended,
        ChatMessageViewerComponent,
        ActionFormComponentExtended,
        ActionTestHarnessComponent,
        ActionTestHarnessDialogComponent,
        ActionExecutionLogFormComponentExtended,
        ActionParamDialogComponent,
        AIAgentRunFormComponentExtended,
        AIAgentRunTimelineComponent,
        AIAgentRunStepNodeComponent,
        AIAgentRunAnalyticsComponent,
        AIAgentRunVisualizationComponent,
        AIAgentRunStepDetailComponent,
        QueryFormExtendedComponent,
        QueryRunDialogComponent,
        QueryCategoryDialogComponent,
        FlowAgentFormSectionComponent,
        StepInfoControlComponent,
        FlowAgentDiagramComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        LayoutModule,
        ExpansionPanelModule,
        TabStripModule,
        SplitterModule,
        PanelBarModule,
        DialogsModule,
        WindowModule,
        GridModule,
        InputsModule,
        TextBoxModule,
        TextAreaModule,
        NumericTextBoxModule,
        SwitchModule,
        DropDownsModule,
        ComboBoxModule,
        DropDownTreesModule,
        DropDownListModule,
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
        DeepDiffModule,
        TreeViewModule,
        CheckBoxModule,
        AITestHarnessModule,
        ActionGalleryModule
    ],
    exports: [
        EntityFormExtendedComponent,
        ActionTopComponentExtended,
        EntityActionExtendedFormComponent,
        TemplatesFormExtendedComponent,
        TemplateEditorComponent,
        AIPromptFormComponentExtended,
        AIAgentFormComponentExtended,
        AIPromptRunFormComponentExtended,
        ChatMessageViewerComponent,
        ActionFormComponentExtended,
        ActionTestHarnessComponent,
        ActionTestHarnessDialogComponent,
        ActionExecutionLogFormComponentExtended,
        AIAgentRunFormComponentExtended,
        AIAgentRunTimelineComponent,
        AIAgentRunStepNodeComponent,
        AIAgentRunAnalyticsComponent,
        QueryFormExtendedComponent,
        FlowAgentFormSectionComponent,
        StepInfoControlComponent,
        FlowAgentDiagramComponent,
    ],
    providers: [
        NewAgentDialogService,
        AIAgentManagementService
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
    LoadActionExecutionLogFormComponentExtended();
    LoadActionFormComponentExtended();
    LoadAIAgentRunFormComponent();
    LoadQueryFormExtendedComponent();
}