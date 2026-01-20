import { Component } from '@angular/core';
import { AIAgentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'AI Agents') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagent-form',
    templateUrl: './aiagent.form.component.html'
})
export class AIAgentFormComponent extends BaseFormComponent {
    public record!: AIAgentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'agentIdentityPresentation', sectionName: 'Agent Identity & Presentation', isExpanded: true },
            { sectionKey: 'hierarchyInvocation', sectionName: 'Hierarchy & Invocation', isExpanded: true },
            { sectionKey: 'contextCompression', sectionName: 'Context Compression', isExpanded: false },
            { sectionKey: 'payloadDataFlow', sectionName: 'Payload & Data Flow', isExpanded: false },
            { sectionKey: 'runtimeLimitsExecutionSettings', sectionName: 'Runtime Limits & Execution Settings', isExpanded: false },
            { sectionKey: 'attachmentStorage', sectionName: 'Attachment Storage', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'aIAgentActions', sectionName: 'AIAgent Actions', isExpanded: false },
            { sectionKey: 'aIAgentLearningCycles', sectionName: 'AIAgent Learning Cycles', isExpanded: false },
            { sectionKey: 'aIAgentModels', sectionName: 'AIAgent Models', isExpanded: false },
            { sectionKey: 'aIAgentRequests', sectionName: 'AI Agent Requests', isExpanded: false },
            { sectionKey: 'mJAIAgentArtifactTypes', sectionName: 'MJ: AI Agent Artifact Types', isExpanded: false },
            { sectionKey: 'mJAIAgentDataSources', sectionName: 'MJ: AI Agent Data Sources', isExpanded: false },
            { sectionKey: 'mJAIAgentModalities', sectionName: 'MJ: AI Agent Modalities', isExpanded: false },
            { sectionKey: 'mJAIAgentPermissions', sectionName: 'MJ: AI Agent Permissions', isExpanded: false },
            { sectionKey: 'mJAIAgentRelationships', sectionName: 'MJ: AI Agent Relationships', isExpanded: false },
            { sectionKey: 'mJAIAgentSteps', sectionName: 'MJ: AI Agent Steps', isExpanded: false },
            { sectionKey: 'aIAgentNotes', sectionName: 'AIAgent Notes', isExpanded: false },
            { sectionKey: 'mJAIAgentConfigurations', sectionName: 'MJ: AI Agent Configurations', isExpanded: false },
            { sectionKey: 'mJAIAgentExamples', sectionName: 'MJ: AI Agent Examples', isExpanded: false },
            { sectionKey: 'mJAIAgentPrompts', sectionName: 'MJ: AI Agent Prompts', isExpanded: false },
            { sectionKey: 'mJAIAgentRelationships1', sectionName: 'MJ: AI Agent Relationships', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'MJ: AI Agent Runs', isExpanded: false },
            { sectionKey: 'mJAIAgentSteps1', sectionName: 'MJ: AI Agent Steps', isExpanded: false },
            { sectionKey: 'mJTasks', sectionName: 'MJ: Tasks', isExpanded: false },
            { sectionKey: 'aIResultCache', sectionName: 'AI Result Cache', isExpanded: false },
            { sectionKey: 'mJAIPromptRuns', sectionName: 'MJ: AI Prompt Runs', isExpanded: false },
            { sectionKey: 'conversationDetails', sectionName: 'Conversation Details', isExpanded: false },
            { sectionKey: 'aIAgents', sectionName: 'AI Agents', isExpanded: false }
        ]);
    }
}

export function LoadAIAgentFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
