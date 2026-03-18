import { Component } from '@angular/core';
import { HubSpotTicketNoteEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Ticket Notes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotticketnote-form',
    templateUrl: './hubspotticketnote.form.component.html'
})
export class HubSpotTicketNoteFormComponent extends BaseFormComponent {
    public record!: HubSpotTicketNoteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'noteContext', sectionName: 'Note Context', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

