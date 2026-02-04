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
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { EntityFormComponentExtended, LoadEntityFormComponentExtended } from "./Entities/entity-form.component";
import { MJTabStripModule } from "@memberjunction/ng-tabstrip";
import { ContainerDirectivesModule } from "@memberjunction/ng-container-directives";
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
import { AgentsModule } from "@memberjunction/ng-agents";
import { AITestHarnessModule } from "@memberjunction/ng-ai-test-harness";
import { ActionGalleryModule } from "@memberjunction/ng-action-gallery";
import { TestingModule } from "@memberjunction/ng-testing";
import { JoinGridModule } from "@memberjunction/ng-join-grid";
import { CodeEditorModule } from "@memberjunction/ng-code-editor";
import { DeepDiffModule } from "@memberjunction/ng-deep-diff";
import { TreeViewModule } from '@progress/kendo-angular-treeview';
import { EntityRelationshipDiagramModule } from '@memberjunction/ng-entity-relationship-diagram';
import { ListManagementModule } from '@memberjunction/ng-list-management';
import { EntitySelectorDialogComponent } from "./shared/entity-selector-dialog.component";
import { AIPromptRunFormComponentExtended } from "./AIPromptRuns/ai-prompt-run-form.component";
import { ChatMessageViewerComponent } from "./AIPromptRuns/chat-message-viewer.component";
import { ActionFormComponentExtended, LoadActionFormComponentExtended } from "./Actions/action-form.component";
import { ActionExecutionLogFormComponentExtended, LoadActionExecutionLogFormComponentExtended } from "./Actions/action-execution-log-form.component";
import { ActionsModule } from "@memberjunction/ng-actions";
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
import { FlowEditorModule } from "@memberjunction/ng-flow-editor";
import { TestRunFormComponentExtended, LoadTestRunFormComponentExtended } from "./Tests/test-run-form.component";
import { TestFormComponentExtended, LoadTestFormComponentExtended } from "./Tests/test-form.component";
import { TestSuiteRunFormComponentExtended, LoadTestSuiteRunFormComponentExtended } from "./Tests/test-suite-run-form.component";
import { TestSuiteFormComponentExtended, LoadTestSuiteFormComponentExtended } from "./Tests/test-suite-form.component";
import { TestRunFeedbackFormComponentExtended, LoadTestRunFeedbackFormComponentExtended } from "./Tests/test-run-feedback-form.component";
import { TestRubricFormComponentExtended, LoadTestRubricFormComponentExtended } from "./Tests/test-rubric-form.component";
import { EntityLinkPillComponent, LoadEntityLinkPillComponent } from "./Tests/entity-link-pill.component";
import { ListFormComponentExtended, LoadListFormComponentExtended } from "./Lists/list-form.component";

@NgModule({
    declarations: [
        EntityFormComponentExtended,
        EntityActionExtendedFormComponent,
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
        ActionExecutionLogFormComponentExtended,
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
        TestRunFormComponentExtended,
        TestFormComponentExtended,
        TestSuiteRunFormComponentExtended,
        TestSuiteFormComponentExtended,
        TestRunFeedbackFormComponentExtended,
        TestRubricFormComponentExtended,
        EntityLinkPillComponent,
        ListFormComponentExtended,
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
        ActionGalleryModule,
        TestingModule,
        FlowEditorModule,
        SharedGenericModule,
        EntityRelationshipDiagramModule,
        ListManagementModule,
        ActionsModule,
        AgentsModule
    ],
    exports: [
        EntityFormComponentExtended,
        EntityActionExtendedFormComponent,
        TemplatesFormExtendedComponent,
        TemplateEditorComponent,
        AIPromptFormComponentExtended,
        AIAgentFormComponentExtended,
        AIPromptRunFormComponentExtended,
        ChatMessageViewerComponent,
        ActionFormComponentExtended,
        ActionExecutionLogFormComponentExtended,
        AIAgentRunFormComponentExtended,
        AIAgentRunTimelineComponent,
        AIAgentRunStepNodeComponent,
        AIAgentRunAnalyticsComponent,
        QueryFormExtendedComponent,
        FlowAgentFormSectionComponent,
        TestRunFormComponentExtended,
        TestFormComponentExtended,
        TestSuiteRunFormComponentExtended,
        TestSuiteFormComponentExtended,
        TestRunFeedbackFormComponentExtended,
        TestRubricFormComponentExtended,
        EntityLinkPillComponent,
        ListFormComponentExtended,
        ActionsModule
    ],
    providers: [
        NewAgentDialogService,
        AIAgentManagementService
    ]
})
export class MemberJunctionCoreEntityFormsModule { }

export function LoadCoreCustomForms() {
    LoadEntityFormComponentExtended()
    LoadEntityActionExtendedFormComponent();
    LoadTemplatesFormExtendedComponent();
    LoadAIPromptFormComponentExtended();
    LoadAIAgentFormComponentExtended();
    LoadActionExecutionLogFormComponentExtended();
    LoadActionFormComponentExtended();
    LoadAIAgentRunFormComponent();
    LoadQueryFormExtendedComponent();
    LoadTestRunFormComponentExtended();
    LoadTestFormComponentExtended();
    LoadTestSuiteRunFormComponentExtended();
    LoadTestSuiteFormComponentExtended();
    LoadTestRunFeedbackFormComponentExtended();
    LoadTestRubricFormComponentExtended();
    LoadEntityLinkPillComponent();
    LoadListFormComponentExtended();
}