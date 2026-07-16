import { Component } from '@angular/core';
import { constantcontactcontactsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Contacts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactcontacts-form',
    templateUrl: './constantcontactcontacts.form.component.html'
})
export class constantcontactcontactsFormComponent extends BaseFormComponent {
    public record!: constantcontactcontactsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'eventsRegistrations', sectionName: 'Events Registrations', isExpanded: false },
            { sectionKey: 'contactsXrefs', sectionName: 'Contacts Xrefs', isExpanded: false },
            { sectionKey: 'contactsSignUpForms', sectionName: 'Contacts Sign Up Forms', isExpanded: false },
            { sectionKey: 'contactReportsOpenAndClickRates', sectionName: 'Contact Reports Open And Click Rates', isExpanded: false }
        ]);
    }
}

