import { Component } from '@angular/core';
import { AIAgentRunStepEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Run Steps') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aiagentrunstep-form',
    templateUrl: './aiagentrunstep.form.component.html'
})
export class AIAgentRunStepFormComponent extends BaseFormComponent {
    public record!: AIAgentRunStepEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'stepIdentificationHierarchy', sectionName: 'Step Identification & Hierarchy', isExpanded: true },
            { sectionKey: 'executionStatusValidation', sectionName: 'Execution Status & Validation', isExpanded: true },
            { sectionKey: 'dataPayload', sectionName: 'Data & Payload', isExpanded: false },
            { sectionKey: 'notesSystemMetadata', sectionName: 'Notes & System Metadata', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentRunSteps', sectionName: 'MJ: AI Agent Run Steps', isExpanded: false }
        ]);
    }
}

export function LoadAIAgentRunStepFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
