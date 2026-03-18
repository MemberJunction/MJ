import { Component } from '@angular/core';
import { HubSpotTicketEmailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Ticket Emails') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotticketemail-form',
    templateUrl: './hubspotticketemail.form.component.html'
})
export class HubSpotTicketEmailFormComponent extends BaseFormComponent {
    public record!: HubSpotTicketEmailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

