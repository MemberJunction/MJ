import { Component } from '@angular/core';
import { MJAIAgentRunStepEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Run Steps') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentrunstep-form',
    templateUrl: './mjaiagentrunstep.form.component.html'
})
export class MJAIAgentRunStepFormComponent extends BaseFormComponent {
    public record!: MJAIAgentRunStepEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'stepIdentificationHierarchy', sectionName: 'Step Identification & Hierarchy', isExpanded: true },
            { sectionKey: 'executionStatusValidation', sectionName: 'Execution Status & Validation', isExpanded: true },
            { sectionKey: 'dataPayload', sectionName: 'Data & Payload', isExpanded: false },
            { sectionKey: 'notesSystemMetadata', sectionName: 'Notes & System Metadata', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentRunSteps', sectionName: 'AI Agent Run Steps', isExpanded: false }
        ]);
    }
}

