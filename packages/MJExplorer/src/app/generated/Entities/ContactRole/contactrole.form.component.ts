import { Component } from '@angular/core';
import { ContactRoleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Contact Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contactrole-form',
    templateUrl: './contactrole.form.component.html'
})
export class ContactRoleFormComponent extends BaseFormComponent {
    public record!: ContactRoleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiers', sectionName: 'Identifiers', isExpanded: true },
            { sectionKey: 'roleInformation', sectionName: 'Role Information', isExpanded: true },
            { sectionKey: 'roleConfiguration', sectionName: 'Role Configuration', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'organizationContacts', sectionName: 'Organization Contacts', isExpanded: false }
        ]);
    }
}

export function LoadContactRoleFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
