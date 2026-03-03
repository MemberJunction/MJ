import { Component } from '@angular/core';
import { MJScheduledActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Scheduled Actions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjscheduledaction-form',
    templateUrl: './mjscheduledaction.form.component.html'
})
export class MJScheduledActionFormComponent extends BaseFormComponent {
    public record!: MJScheduledActionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'actionInformation', sectionName: 'Action Information', isExpanded: true },
            { sectionKey: 'ownershipStatus', sectionName: 'Ownership & Status', isExpanded: true },
            { sectionKey: 'scheduleSettings', sectionName: 'Schedule Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'scheduledActionParams', sectionName: 'Scheduled Action Params', isExpanded: false }
        ]);
    }
}

