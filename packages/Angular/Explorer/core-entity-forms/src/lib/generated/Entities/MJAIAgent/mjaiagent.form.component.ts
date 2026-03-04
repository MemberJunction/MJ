import { Component } from '@angular/core';
import { MJAIAgentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agents') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagent-form',
    templateUrl: './mjaiagent.form.component.html'
})
export class MJAIAgentFormComponent extends BaseFormComponent {
    public record!: MJAIAgentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'agentIdentityPresentation', sectionName: 'Agent Identity & Presentation', isExpanded: true },
            { sectionKey: 'hierarchyInvocation', sectionName: 'Hierarchy & Invocation', isExpanded: true },
            { sectionKey: 'contextCompression', sectionName: 'Context Compression', isExpanded: false },
            { sectionKey: 'payloadDataFlow', sectionName: 'Payload & Data Flow', isExpanded: false },
            { sectionKey: 'runtimeLimitsExecutionSettings', sectionName: 'Runtime Limits & Execution Settings', isExpanded: false },
            { sectionKey: 'attachmentStorage', sectionName: 'Attachment Storage', isExpanded: false },
            { sectionKey: 'scopeConfiguration', sectionName: 'Scope Configuration', isExpanded: false },
            { sectionKey: 'retentionArchiving', sectionName: 'Retention & Archiving', isExpanded: false },
            { sectionKey: 'retrievalRanking', sectionName: 'Retrieval & Ranking', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentActions', sectionName: 'AIAgent Actions', isExpanded: false },
            { sectionKey: 'mJAIAgentArtifactTypes', sectionName: 'AI Agent Artifact Types', isExpanded: false },
            { sectionKey: 'mJAIAgentDataSources', sectionName: 'AI Agent Data Sources', isExpanded: false },
            { sectionKey: 'mJAIAgentLearningCycles', sectionName: 'AIAgent Learning Cycles', isExpanded: false },
            { sectionKey: 'mJAIAgentModalities', sectionName: 'AI Agent Modalities', isExpanded: false },
            { sectionKey: 'mJAIAgentModels', sectionName: 'AIAgent Models', isExpanded: false },
            { sectionKey: 'mJAIAgentPermissions', sectionName: 'AI Agent Permissions', isExpanded: false },
            { sectionKey: 'mJAIAgentRelationshipsAgentID', sectionName: 'AI Agent Relationships (Agent ID)', isExpanded: false },
            { sectionKey: 'mJAIAgentRequests', sectionName: 'AI Agent Requests', isExpanded: false },
            { sectionKey: 'mJAIAgentStepsAgentID', sectionName: 'AI Agent Steps (Agent ID)', isExpanded: false },
            { sectionKey: 'mJAIAgentConfigurations', sectionName: 'AI Agent Configurations', isExpanded: false },
            { sectionKey: 'mJAIAgentExamples', sectionName: 'AI Agent Examples', isExpanded: false },
            { sectionKey: 'mJAIAgentNotes', sectionName: 'AIAgent Notes', isExpanded: false },
            { sectionKey: 'mJAIAgentPrompts', sectionName: 'AI Agent Prompts', isExpanded: false },
            { sectionKey: 'mJAIAgentRelationshipsSubAgentID', sectionName: 'AI Agent Relationships (Sub Agent ID)', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'AI Agent Runs', isExpanded: false },
            { sectionKey: 'mJAIAgentStepsSubAgentID', sectionName: 'AI Agent Steps (Sub Agent ID)', isExpanded: false },
            { sectionKey: 'mJTasks', sectionName: 'Tasks', isExpanded: false },
            { sectionKey: 'mJAIPromptRuns', sectionName: 'AI Prompt Runs', isExpanded: false },
            { sectionKey: 'mJAIResultCache', sectionName: 'AI Result Cache', isExpanded: false },
            { sectionKey: 'mJConversationDetails', sectionName: 'Conversation Details', isExpanded: false },
            { sectionKey: 'mJAIAgents', sectionName: 'AI Agents', isExpanded: false }
        ]);
    }
}

