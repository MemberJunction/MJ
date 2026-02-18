import { Component } from '@angular/core';
import { MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentrun-form',
    templateUrl: './mjaiagentrun.form.component.html'
})
export class MJAIAgentRunFormComponent extends BaseFormComponent {
    public record!: MJAIAgentRunEntity;

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
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentExamples', sectionName: 'MJ: AI Agent Examples', isExpanded: false },
            { sectionKey: 'aIAgentNotes', sectionName: 'AI Agent Notes', isExpanded: false },
            { sectionKey: 'mJAIAgentRunMedias', sectionName: 'MJ: AI Agent Run Medias', isExpanded: false },
            { sectionKey: 'mJAIAgentRunSteps', sectionName: 'MJ: AI Agent Run Steps', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'MJ: AI Agent Runs', isExpanded: false },
            { sectionKey: 'mJAIPromptRuns', sectionName: 'MJ: AI Prompt Runs', isExpanded: false }
        ]);
    }
}

