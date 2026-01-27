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
            { sectionKey: 'identity', sectionName: 'Identity', isExpanded: true },
            { sectionKey: 'contactSettings', sectionName: 'Contact Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'aPIKeys', sectionName: 'API Keys', isExpanded: false },
            { sectionKey: 'organizationContacts', sectionName: 'Organization Contacts', isExpanded: false },
            { sectionKey: 'channelMessages', sectionName: 'Channel Messages', isExpanded: false },
            { sectionKey: 'channelMessages1', sectionName: 'Channel Messages', isExpanded: false }
        ]);
    }
}

export function LoadContactFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
