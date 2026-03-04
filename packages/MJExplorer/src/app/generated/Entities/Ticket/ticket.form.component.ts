import { Component } from '@angular/core';
import { TicketEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Tickets') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-ticket-form',
    templateUrl: './ticket.form.component.html'
})
export class TicketFormComponent extends BaseFormComponent {
    public record!: TicketEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'ticketAttachments', sectionName: 'Ticket Attachments', isExpanded: false },
            { sectionKey: 'ticketComments', sectionName: 'Ticket Comments', isExpanded: false },
            { sectionKey: 'ticketTags', sectionName: 'Ticket Tags', isExpanded: false }
        ]);
    }
}

