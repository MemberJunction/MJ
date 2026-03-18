import { Component } from '@angular/core';
import { YourMembershipEventTicketEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Event Tickets') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipeventticket-form',
    templateUrl: './yourmembershipeventticket.form.component.html'
})
export class YourMembershipEventTicketFormComponent extends BaseFormComponent {
    public record!: YourMembershipEventTicketEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ticketInformation', sectionName: 'Ticket Information', isExpanded: true },
            { sectionKey: 'pricingAndInventory', sectionName: 'Pricing and Inventory', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

