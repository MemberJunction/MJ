import { Component } from '@angular/core';
import { HubSpotTicketCallEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Ticket Calls') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotticketcall-form',
    templateUrl: './hubspotticketcall.form.component.html'
})
export class HubSpotTicketCallFormComponent extends BaseFormComponent {
    public record!: HubSpotTicketCallEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'callAssociation', sectionName: 'Call Association', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

