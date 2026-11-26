import { Component } from '@angular/core';
import { MJTourRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Tour Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtourrun-form',
    templateUrl: './mjtourrun.form.component.html'
})
export class MJTourRunFormComponent extends BaseFormComponent {
    public record!: MJTourRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tourExecution', sectionName: 'Tour Execution', isExpanded: true },
            { sectionKey: 'launchAndContext', sectionName: 'Launch and Context', isExpanded: true },
            { sectionKey: 'timelineAndMilestones', sectionName: 'Timeline and Milestones', isExpanded: true },
            { sectionKey: 'integrationsAndReferences', sectionName: 'Integrations and References', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTourRunSteps', sectionName: 'Tour Run Steps', isExpanded: false }
        ]);
    }
}

