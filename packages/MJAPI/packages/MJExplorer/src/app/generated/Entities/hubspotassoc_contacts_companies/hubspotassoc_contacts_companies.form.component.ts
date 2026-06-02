import { Component } from '@angular/core';
import { hubspotassoc_contacts_companiesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Assoc Contacts Companies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotassoc_contacts_companies-form',
    templateUrl: './hubspotassoc_contacts_companies.form.component.html'
})
export class hubspotassoc_contacts_companiesFormComponent extends BaseFormComponent {
    public record!: hubspotassoc_contacts_companiesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

