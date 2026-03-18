import { Component } from '@angular/core';
import { HubSpotContactTicketEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Tickets') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcontactticket-form',
    templateUrl: './hubspotcontactticket.form.component.html'
})
export class HubSpotContactTicketFormComponent extends BaseFormComponent {
    public record!: HubSpotContactTicketEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationshipDetails', sectionName: 'Relationship Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

