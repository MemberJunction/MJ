import { Component } from '@angular/core';
import { WebinarEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Webinars') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-webinar-form',
    templateUrl: './webinar.form.component.html'
})
export class WebinarFormComponent extends BaseFormComponent {
    public record!: WebinarEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'streamingAccess', sectionName: 'Streaming & Access', isExpanded: true },
            { sectionKey: 'scheduleCapacity', sectionName: 'Schedule & Capacity', isExpanded: true },
            { sectionKey: 'webinarOverview', sectionName: 'Webinar Overview', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

