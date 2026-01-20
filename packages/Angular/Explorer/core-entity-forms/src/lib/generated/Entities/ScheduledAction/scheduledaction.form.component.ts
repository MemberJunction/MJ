import { Component } from '@angular/core';
import { ScheduledActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Scheduled Actions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-scheduledaction-form',
    templateUrl: './scheduledaction.form.component.html'
})
export class ScheduledActionFormComponent extends BaseFormComponent {
    public record!: ScheduledActionEntity;

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

export function LoadScheduledActionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
