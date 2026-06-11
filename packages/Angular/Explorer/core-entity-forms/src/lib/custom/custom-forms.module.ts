import { NgModule } from "@angular/core";
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MJButtonDirective, MJAccordionPanelComponent, MJAccordionTitleDirective, MJDropdownComponent, MJComboboxComponent, MJSwitchComponent, MJDialogComponent, MJDialogTitlebarComponent, MJDialogActionsComponent, MJNumericInputComponent, MJWindowComponent, MJWindowTitlebarComponent, MJProgressBarComponent, MjSlidePanelComponent } from '@memberjunction/ng-ui-components';
import { AngularSplitModule } from 'angular-split';
import { AgGridModule } from 'ag-grid-angular';
import { BaseFormsModule, MjFormDialogComponent } from '@memberjunction/ng-base-forms';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { MJEntityFormComponentExtended } from "./Entities/entity-form.component";
import { MJTabStripModule } from "@memberjunction/ng-tabstrip";
import { MJEntityActionFormComponentExtended } from "./EntityActions/entityaction.form.component";
import { MJTemplateFormComponentExtended } from "./Templates/templates-form.component";
import { TemplateParamDialogComponent } from "./Templates/template-param-dialog.component";
import { TemplateParamsGridComponent } from "./Templates/template-params-grid.component";
import { TemplateEditorComponent } from "../shared/components/template-editor.component";
import { MJAIPromptFormComponentExtended } from "./AIPrompts/ai-prompt-form.component";
import { MJAIAgentFormComponentExtended } from "./AIAgents/ai-agent-form.component";
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
import { EntityRelationshipDiagramModule } from '@memberjunction/ng-entity-relationship-diagram';
import { ListManagementModule } from '@memberjunction/ng-list-management';
import { EntitySelectorDialogComponent } from "./shared/entity-selector-dialog.component";
import { MJAIPromptRunFormComponentExtended } from "./AIPromptRuns/ai-prompt-run-form.component";
import { ChatMessageViewerComponent } from "./AIPromptRuns/chat-message-viewer.component";
import { MJActionFormComponentExtended } from "./Actions/action-form.component";
import { MJActionExecutionLogFormComponentExtended } from "./Actions/action-execution-log-form.component";
import { ActionsModule } from "@memberjunction/ng-actions";
import { MJAIAgentRunFormComponentExtended } from "./ai-agent-run/ai-agent-run.component";
import { AIAgentRunTimelineComponent } from "./ai-agent-run/ai-agent-run-timeline.component";
import { AIAgentRunStepNodeComponent } from "./ai-agent-run/ai-agent-run-step-node.component";
import { AIAgentRunAnalyticsComponent } from "./ai-agent-run/ai-agent-run-analytics.component";
import { AIAgentRunVisualizationComponent } from "./ai-agent-run/ai-agent-run-visualization.component";
import { AIAgentRunStepDetailComponent } from "./ai-agent-run/ai-agent-run-step-detail.component";
import { MJQueryFormComponentExtended } from "./Queries/query-form.component";
import { QueryRunDialogComponent } from "./Queries/query-run-dialog.component";
import { FlowAgentFormSectionComponent } from "./AIAgents/FlowAgentType/flow-agent-form-section.component";
import { FlowEditorModule } from "@memberjunction/ng-flow-editor";
import { MarkdownModule } from "@memberjunction/ng-markdown";
import { NgTreesModule } from "@memberjunction/ng-trees";
import { MJTestRunFormComponentExtended } from "./Tests/test-run-form.component";
import { MJTestFormComponentExtended } from "./Tests/test-form.component";
import { MJTestSuiteRunFormComponentExtended } from "./Tests/test-suite-run-form.component";
import { MJTestSuiteFormComponentExtended } from "./Tests/test-suite-form.component";
import { MJTestRunFeedbackFormComponentExtended } from "./Tests/test-run-feedback-form.component";
import { MJTestRubricFormComponentExtended } from "./Tests/test-rubric-form.component";
import { EntityLinkPillComponent } from "./Tests/entity-link-pill.component";
import { MJListFormComponentExtended } from "./Lists/list-form.component";
// ContentSources: the custom-form override was removed once dynamic
// BaseFormPanel slots landed. Slot-registered panels live in
// `../panels/content-sources/` and self-mount into the generated form via
// the `after-fields` slot. Imported here so the @RegisterClassEx decorators
// run at module load (Angular tree-shaking guard).
import { TagPipelineConfigurationPanel } from "../panels/content-sources/tag-pipeline-configuration.panel";
import { WebsiteCrawlerSettingsPanel } from "../panels/content-sources/website-crawler-settings.panel";
import { MJSearchScopeFormComponentExtended } from "./SearchScopes/searchscope-form.component";
import { MJSearchScopeProviderFormComponentExtended } from "./SearchScopes/searchscopeprovider-form.component";
import { SearchModule } from "@memberjunction/ng-search";
import { MJAIAgentSessionFormComponentExtended } from "./AIAgentSessions/ai-agent-session-form.component";
import { MJAIAgentChannelFormComponentExtended } from "./AIAgentChannels/ai-agent-channel-form.component";

@NgModule({
    declarations: [
        MJEntityFormComponentExtended,
        MJEntityActionFormComponentExtended,
        MJTemplateFormComponentExtended,
        TemplateParamDialogComponent,
        TemplateParamsGridComponent,
        TemplateEditorComponent,
        MJAIPromptFormComponentExtended,
        MJAIAgentFormComponentExtended,
        NewAgentDialogComponent,
        AddActionDialogComponent,
        PromptSelectorDialogComponent,
        AgentPromptAdvancedSettingsDialogComponent,
        SubAgentAdvancedSettingsDialogComponent,
        SubAgentSelectorDialogComponent,
        CreatePromptDialogComponent,
        CreateSubAgentDialogComponent,
        EntitySelectorDialogComponent,
        MJAIPromptRunFormComponentExtended,
        ChatMessageViewerComponent,
        MJActionFormComponentExtended,
        MJActionExecutionLogFormComponentExtended,
        MJAIAgentRunFormComponentExtended,
        AIAgentRunTimelineComponent,
        AIAgentRunStepNodeComponent,
        AIAgentRunAnalyticsComponent,
        AIAgentRunVisualizationComponent,
        AIAgentRunStepDetailComponent,
        MJQueryFormComponentExtended,
        QueryRunDialogComponent,
        FlowAgentFormSectionComponent,
        MJTestRunFormComponentExtended,
        MJTestFormComponentExtended,
        MJTestSuiteRunFormComponentExtended,
        MJTestSuiteFormComponentExtended,
        MJTestRunFeedbackFormComponentExtended,
        MJTestRubricFormComponentExtended,
        EntityLinkPillComponent,
        MJListFormComponentExtended,
        // ContentSource-specific BaseFormPanel slot components (no custom form override).
        TagPipelineConfigurationPanel,
        WebsiteCrawlerSettingsPanel,
        MJSearchScopeFormComponentExtended,
        MJSearchScopeProviderFormComponentExtended,
        MJAIAgentSessionFormComponentExtended,
        MJAIAgentChannelFormComponentExtended,
    ],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        DragDropModule,
        AgGridModule,
        MJButtonDirective,
        MJAccordionPanelComponent,
        MJAccordionTitleDirective,
        MJDropdownComponent,
        MJComboboxComponent,
        MJSwitchComponent,
        MJDialogComponent,
        MJDialogTitlebarComponent,
        MJDialogActionsComponent,
        MJNumericInputComponent,
        MJWindowComponent,
        MJWindowTitlebarComponent,
        MJProgressBarComponent,
        LinkDirectivesModule,
        JoinGridModule,
        BaseFormsModule,
        MJTabStripModule,
        CodeEditorModule,
        DeepDiffModule,
        AITestHarnessModule,
        ActionGalleryModule,
        TestingModule,
        FlowEditorModule,
        SharedGenericModule,
        EntityRelationshipDiagramModule,
        ListManagementModule,
        ActionsModule,
        AgentsModule,
        EntityViewerModule,
        MarkdownModule,
        NgTreesModule,
        AngularSplitModule,
        MjSlidePanelComponent,
        MjFormDialogComponent,
        SearchModule
    ],
    exports: [
        MJEntityFormComponentExtended,
        MJEntityActionFormComponentExtended,
        MJTemplateFormComponentExtended,
        TemplateEditorComponent,
        MJAIPromptFormComponentExtended,
        MJAIAgentFormComponentExtended,
        MJAIPromptRunFormComponentExtended,
        ChatMessageViewerComponent,
        MJActionFormComponentExtended,
        MJActionExecutionLogFormComponentExtended,
        MJAIAgentRunFormComponentExtended,
        AIAgentRunTimelineComponent,
        AIAgentRunStepNodeComponent,
        AIAgentRunAnalyticsComponent,
        MJQueryFormComponentExtended,
        FlowAgentFormSectionComponent,
        MJTestRunFormComponentExtended,
        MJTestFormComponentExtended,
        MJTestSuiteRunFormComponentExtended,
        MJTestSuiteFormComponentExtended,
        MJTestRunFeedbackFormComponentExtended,
        MJTestRubricFormComponentExtended,
        EntityLinkPillComponent,
        MJListFormComponentExtended,
        TagPipelineConfigurationPanel,
        WebsiteCrawlerSettingsPanel,
        MJSearchScopeFormComponentExtended,
        MJSearchScopeProviderFormComponentExtended,
        MJAIAgentSessionFormComponentExtended,
        MJAIAgentChannelFormComponentExtended,
        ActionsModule
    ],
    providers: [
        NewAgentDialogService,
        AIAgentManagementService
    ]
})
export class MemberJunctionCoreEntityFormsModule { }
