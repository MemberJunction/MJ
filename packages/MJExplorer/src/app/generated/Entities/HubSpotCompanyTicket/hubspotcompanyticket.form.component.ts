import { Component } from '@angular/core';
import { HubSpotCompanyTicketEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Company Tickets') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcompanyticket-form',
    templateUrl: './hubspotcompanyticket.form.component.html'
})
export class HubSpotCompanyTicketFormComponent extends BaseFormComponent {
    public record!: HubSpotCompanyTicketEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

