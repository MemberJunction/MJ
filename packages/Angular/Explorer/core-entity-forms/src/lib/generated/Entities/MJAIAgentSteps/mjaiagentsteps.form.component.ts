import { Component } from '@angular/core';
import { MJAIAgentStepsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Steps') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentsteps-form',
    templateUrl: './mjaiagentsteps.form.component.html'
})
export class MJAIAgentStepsFormComponent extends BaseFormComponent {
    public record!: MJAIAgentStepsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'coreDefinition', sectionName: 'Core Definition', isExpanded: true },
            { sectionKey: 'executionControls', sectionName: 'Execution Controls', isExpanded: true },
            { sectionKey: 'targetResources', sectionName: 'Target Resources', isExpanded: false },
            { sectionKey: 'visualLayout', sectionName: 'Visual Layout', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentStepPaths', sectionName: 'MJ: AI Agent Step Paths', isExpanded: false },
            { sectionKey: 'mJAIAgentStepPaths1', sectionName: 'MJ: AI Agent Step Paths', isExpanded: false }
        ]);
    }
}

