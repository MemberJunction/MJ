import { Component } from '@angular/core';
import { MJAIAgentStepEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Steps') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentstep-form',
    templateUrl: './mjaiagentstep.form.component.html'
})
export class MJAIAgentStepFormComponent extends BaseFormComponent {
    public record!: MJAIAgentStepEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'coreDefinition', sectionName: 'Core Definition', isExpanded: true },
            { sectionKey: 'executionControls', sectionName: 'Execution Controls', isExpanded: true },
            { sectionKey: 'targetResources', sectionName: 'Target Resources', isExpanded: false },
            { sectionKey: 'visualLayout', sectionName: 'Visual Layout', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentStepPathsDestinationStepID', sectionName: 'AI Agent Step Paths (Destination Step ID)', isExpanded: false },
            { sectionKey: 'mJAIAgentStepPathsOriginStepID', sectionName: 'AI Agent Step Paths (Origin Step ID)', isExpanded: false }
        ]);
    }
}

