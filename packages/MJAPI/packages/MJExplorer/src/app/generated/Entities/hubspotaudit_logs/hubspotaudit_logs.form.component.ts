import { Component } from '@angular/core';
import { hubspotaudit_logsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Audit Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotaudit_logs-form',
    templateUrl: './hubspotaudit_logs.form.component.html'
})
export class hubspotaudit_logsFormComponent extends BaseFormComponent {
    public record!: hubspotaudit_logsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'actorInformation', sectionName: 'Actor Information', isExpanded: true },
            { sectionKey: 'eventDetails', sectionName: 'Event Details', isExpanded: true },
            { sectionKey: 'affectedObject', sectionName: 'Affected Object', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

