import { Component } from '@angular/core';
import { hubspotmeeting_schedulerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Meeting Schedulers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotmeeting_scheduler-form',
    templateUrl: './hubspotmeeting_scheduler.form.component.html'
})
export class hubspotmeeting_schedulerFormComponent extends BaseFormComponent {
    public record!: hubspotmeeting_schedulerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'configurationSettings', sectionName: 'Configuration Settings', isExpanded: true },
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'financialDetails', sectionName: 'Financial Details', isExpanded: false },
            { sectionKey: 'meetingParameters', sectionName: 'Meeting Parameters', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

