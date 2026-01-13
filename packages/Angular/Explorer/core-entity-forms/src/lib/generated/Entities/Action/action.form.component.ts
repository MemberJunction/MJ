import { Component } from '@angular/core';
import { ActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Actions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-action-form',
    templateUrl: './action.form.component.html'
})
export class ActionFormComponent extends BaseFormComponent {
    public record!: ActionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identificationHierarchy', sectionName: 'Identification & Hierarchy', isExpanded: true },
            { sectionKey: 'definitionPrompting', sectionName: 'Definition & Prompting', isExpanded: true },
            { sectionKey: 'codeApproval', sectionName: 'Code & Approval', isExpanded: false },
            { sectionKey: 'displayExecution', sectionName: 'Display & Execution', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'params', sectionName: 'Params', isExpanded: false },
            { sectionKey: 'libraries', sectionName: 'Libraries', isExpanded: false },
            { sectionKey: 'resultCodes', sectionName: 'Result Codes', isExpanded: false },
            { sectionKey: 'aIAgentActions', sectionName: 'AIAgent Actions', isExpanded: false },
            { sectionKey: 'scheduledActions', sectionName: 'Scheduled Actions', isExpanded: false },
            { sectionKey: 'actionContexts', sectionName: 'Action Contexts', isExpanded: false },
            { sectionKey: 'entityActions', sectionName: 'Entity Actions', isExpanded: false },
            { sectionKey: 'mJAIAgentSteps', sectionName: 'MJ: AI Agent Steps', isExpanded: false },
            { sectionKey: 'executionLogs', sectionName: 'Execution Logs', isExpanded: false },
            { sectionKey: 'authorizations', sectionName: 'Authorizations', isExpanded: false },
            { sectionKey: 'actions', sectionName: 'Actions', isExpanded: false }
        ]);
    }
}

export function LoadActionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
