import { Component } from '@angular/core';
import { HubSpotCompanyNoteEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Company Notes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcompanynote-form',
    templateUrl: './hubspotcompanynote.form.component.html'
})
export class HubSpotCompanyNoteFormComponent extends BaseFormComponent {
    public record!: HubSpotCompanyNoteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

