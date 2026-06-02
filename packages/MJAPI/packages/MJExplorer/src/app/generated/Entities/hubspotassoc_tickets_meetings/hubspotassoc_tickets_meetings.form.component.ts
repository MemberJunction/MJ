import { Component } from '@angular/core';
import { hubspotassoc_tickets_meetingsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Assoc Tickets Meetings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotassoc_tickets_meetings-form',
    templateUrl: './hubspotassoc_tickets_meetings.form.component.html'
})
export class hubspotassoc_tickets_meetingsFormComponent extends BaseFormComponent {
    public record!: hubspotassoc_tickets_meetingsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

