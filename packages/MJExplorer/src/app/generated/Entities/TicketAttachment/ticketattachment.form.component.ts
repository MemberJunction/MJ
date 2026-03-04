import { Component } from '@angular/core';
import { TicketAttachmentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Ticket Attachments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-ticketattachment-form',
    templateUrl: './ticketattachment.form.component.html'
})
export class TicketAttachmentFormComponent extends BaseFormComponent {
    public record!: TicketAttachmentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

