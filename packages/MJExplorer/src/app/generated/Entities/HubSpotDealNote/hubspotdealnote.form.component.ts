import { Component } from '@angular/core';
import { HubSpotDealNoteEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Deal Notes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotdealnote-form',
    templateUrl: './hubspotdealnote.form.component.html'
})
export class HubSpotDealNoteFormComponent extends BaseFormComponent {
    public record!: HubSpotDealNoteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'noteAssociation', sectionName: 'Note Association', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

