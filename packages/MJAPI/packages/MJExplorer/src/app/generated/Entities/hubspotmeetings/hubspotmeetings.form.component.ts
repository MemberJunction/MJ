import { Component } from '@angular/core';
import { hubspotmeetingsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Meetings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotmeetings-form',
    templateUrl: './hubspotmeetings.form.component.html'
})
export class hubspotmeetingsFormComponent extends BaseFormComponent {
    public record!: hubspotmeetingsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ownershipAndAccess', sectionName: 'Ownership and Access', isExpanded: true },
            { sectionKey: 'outcomeAndMetrics', sectionName: 'Outcome and Metrics', isExpanded: true },
            { sectionKey: 'scheduleAndLocation', sectionName: 'Schedule and Location', isExpanded: false },
            { sectionKey: 'meetingDetails', sectionName: 'Meeting Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

