import { Component } from '@angular/core';
import { ContactEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Contacts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contact-form',
    templateUrl: './contact.form.component.html'
})
export class ContactFormComponent extends BaseFormComponent {
    public record!: ContactEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'personalInformation', sectionName: 'Personal Information', isExpanded: true },
            { sectionKey: 'contactDetails', sectionName: 'Contact Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'activities', sectionName: 'Activities', isExpanded: false }
        ]);
    }
}

export function LoadContactFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
