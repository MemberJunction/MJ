import { Component } from '@angular/core';
import { HubSpotContactNoteEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Notes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcontactnote-form',
    templateUrl: './hubspotcontactnote.form.component.html'
})
export class HubSpotContactNoteFormComponent extends BaseFormComponent {
    public record!: HubSpotContactNoteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'noteAssociation', sectionName: 'Note Association', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

