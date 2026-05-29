import { Component } from '@angular/core';
import { MJActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Actions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaction-form',
    templateUrl: './mjaction.form.component.html'
})
export class MJActionFormComponent extends BaseFormComponent {
    public record!: MJActionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identificationHierarchy', sectionName: 'Identification & Hierarchy', isExpanded: true },
            { sectionKey: 'definitionPrompting', sectionName: 'Definition & Prompting', isExpanded: true },
            { sectionKey: 'codeApproval', sectionName: 'Code & Approval', isExpanded: false },
            { sectionKey: 'displayExecution', sectionName: 'Display & Execution', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJActionParams', sectionName: 'Params', isExpanded: false },
            { sectionKey: 'mJActionLibraries', sectionName: 'Libraries', isExpanded: false },
            { sectionKey: 'mJActionResultCodes', sectionName: 'Result Codes', isExpanded: false },
            { sectionKey: 'mJAIAgentActions', sectionName: 'AIAgent Actions', isExpanded: false },
            { sectionKey: 'mJMCPServerTools', sectionName: 'MCP Server Tools', isExpanded: false },
            { sectionKey: 'mJScheduledActions', sectionName: 'Scheduled Actions', isExpanded: false },
            { sectionKey: 'mJActionContexts', sectionName: 'Action Contexts', isExpanded: false },
            { sectionKey: 'mJAIAgentSteps', sectionName: 'AI Agent Steps', isExpanded: false },
            { sectionKey: 'mJEntityActions', sectionName: 'Entity Actions', isExpanded: false },
            { sectionKey: 'mJActionExecutionLogs', sectionName: 'Execution Logs', isExpanded: false },
            { sectionKey: 'mJActionAuthorizations', sectionName: 'Authorizations', isExpanded: false },
            { sectionKey: 'mJActions', sectionName: 'Actions', isExpanded: false }
        ]);
    }
}

