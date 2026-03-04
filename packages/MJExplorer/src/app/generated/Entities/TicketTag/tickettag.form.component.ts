import { Component } from '@angular/core';
import { TicketTagEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Ticket Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-tickettag-form',
    templateUrl: './tickettag.form.component.html'
})
export class TicketTagFormComponent extends BaseFormComponent {
    public record!: TicketTagEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

