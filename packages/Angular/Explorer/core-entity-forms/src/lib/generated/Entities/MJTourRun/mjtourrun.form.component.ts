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
            { sectionKey: 'userAndVisitorInformation', sectionName: 'User and Visitor Information', isExpanded: true },
            { sectionKey: 'tourContext', sectionName: 'Tour Context', isExpanded: true },
            { sectionKey: 'executionAndProgress', sectionName: 'Execution and Progress', isExpanded: true },
            { sectionKey: 'launchAndTriggerDetails', sectionName: 'Launch and Trigger Details', isExpanded: true },
            { sectionKey: 'timelineAndMetrics', sectionName: 'Timeline and Metrics', isExpanded: true },
            { sectionKey: 'associatedIntegrations', sectionName: 'Associated Integrations', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTourRunSteps', sectionName: 'Tour Run Steps', isExpanded: false }
        ]);
    }
}

