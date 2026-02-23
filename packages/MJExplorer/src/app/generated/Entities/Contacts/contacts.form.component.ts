import { Component } from '@angular/core';
import { ContactsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Contacts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-contacts-form',
    templateUrl: './contacts.form.component.html'
})
export class ContactsFormComponent extends BaseFormComponent {
    public record!: ContactsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'contactTags', sectionName: 'Contact Tags', isExpanded: false },
            { sectionKey: 'contacts', sectionName: 'Contacts', isExpanded: false },
            { sectionKey: 'activities', sectionName: 'Activities', isExpanded: false },
            { sectionKey: 'deals', sectionName: 'Deals', isExpanded: false }
        ]);
    }
}

