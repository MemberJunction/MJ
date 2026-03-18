import { Component } from '@angular/core';
import { HubSpotNoteEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Notes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotnote-form',
    templateUrl: './hubspotnote.form.component.html'
})
export class HubSpotNoteFormComponent extends BaseFormComponent {
    public record!: HubSpotNoteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'noteContent', sectionName: 'Note Content', isExpanded: true },
            { sectionKey: 'noteInformation', sectionName: 'Note Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'dealNotes', sectionName: 'Deal Notes', isExpanded: false },
            { sectionKey: 'companyNotes', sectionName: 'Company Notes', isExpanded: false },
            { sectionKey: 'ticketNotes', sectionName: 'Ticket Notes', isExpanded: false },
            { sectionKey: 'contactNotes', sectionName: 'Contact Notes', isExpanded: false }
        ]);
    }
}

