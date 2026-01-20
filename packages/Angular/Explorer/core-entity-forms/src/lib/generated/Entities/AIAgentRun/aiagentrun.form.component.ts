import { Component } from '@angular/core';
import { AIAgentRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentrun-form',
    templateUrl: './aiagentrun.form.component.html'
})
export class AIAgentRunFormComponent extends BaseFormComponent {
    public record!: AIAgentRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runIdentificationHierarchy', sectionName: 'Run Identification & Hierarchy', isExpanded: true },
            { sectionKey: 'executionDetailsOutcome', sectionName: 'Execution Details & Outcome', isExpanded: true },
            { sectionKey: 'contextualRelationships', sectionName: 'Contextual Relationships', isExpanded: false },
            { sectionKey: 'resourceUsageCost', sectionName: 'Resource Usage & Cost', isExpanded: false },
            { sectionKey: 'configurationOverrides', sectionName: 'Configuration & Overrides', isExpanded: false },
            { sectionKey: 'testingValidation', sectionName: 'Testing & Validation', isExpanded: false },
            { sectionKey: 'scopeMultiTenant', sectionName: 'Scope & Multi-Tenant', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'aIAgentNotes', sectionName: 'AI Agent Notes', isExpanded: false },
            { sectionKey: 'mJAIAgentExamples', sectionName: 'MJ: AI Agent Examples', isExpanded: false },
            { sectionKey: 'mJAIAgentRunSteps', sectionName: 'MJ: AI Agent Run Steps', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'MJ: AI Agent Runs', isExpanded: false },
            { sectionKey: 'mJAIPromptRuns', sectionName: 'MJ: AI Prompt Runs', isExpanded: false }
        ]);
    }
}

export function LoadAIAgentRunFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
