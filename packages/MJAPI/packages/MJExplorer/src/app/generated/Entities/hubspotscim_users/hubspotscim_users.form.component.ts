import { Component } from '@angular/core';
import { hubspotscim_usersEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Scim Users') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotscim_users-form',
    templateUrl: './hubspotscim_users.form.component.html'
})
export class hubspotscim_usersFormComponent extends BaseFormComponent {
    public record!: hubspotscim_usersEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'userProfile', sectionName: 'User Profile', isExpanded: true },
            { sectionKey: 'accountSettings', sectionName: 'Account Settings', isExpanded: true },
            { sectionKey: 'contactInformation', sectionName: 'Contact Information', isExpanded: false },
            { sectionKey: 'accessControl', sectionName: 'Access Control', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

