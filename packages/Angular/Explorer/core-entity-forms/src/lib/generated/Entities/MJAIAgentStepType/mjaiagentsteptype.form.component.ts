import { Component } from '@angular/core';
import { MJAIAgentStepTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Step Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentsteptype-form',
    templateUrl: './mjaiagentsteptype.form.component.html'
})
export class MJAIAgentStepTypeFormComponent extends BaseFormComponent {
    public record!: MJAIAgentStepTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJAIAgentSteps', sectionName: 'AI Agent Steps', isExpanded: false },
            { sectionKey: 'mJAIAgentRunSteps', sectionName: 'AI Agent Run Steps', isExpanded: false }
        ]);
    }
}

