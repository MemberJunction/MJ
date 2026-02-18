import { Component } from '@angular/core';
import { MeetingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Meetings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-meeting-form',
    templateUrl: './meeting.form.component.html'
})
export class MeetingFormComponent extends BaseFormComponent {
    public record!: MeetingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'meetingScheduleLogistics', sectionName: 'Meeting Schedule & Logistics', isExpanded: true },
            { sectionKey: 'productDetails', sectionName: 'Product Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'webinars', sectionName: 'Webinars', isExpanded: false }
        ]);
    }
}

