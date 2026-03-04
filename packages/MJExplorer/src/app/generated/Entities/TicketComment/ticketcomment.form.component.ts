import { Component } from '@angular/core';
import { TicketCommentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Ticket Comments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-ticketcomment-form',
    templateUrl: './ticketcomment.form.component.html'
})
export class TicketCommentFormComponent extends BaseFormComponent {
    public record!: TicketCommentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

