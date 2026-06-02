import { Component } from '@angular/core';
import { hubspotportal_usersEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Portal Users') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotportal_users-form',
    templateUrl: './hubspotportal_users.form.component.html'
})
export class hubspotportal_usersFormComponent extends BaseFormComponent {
    public record!: hubspotportal_usersEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'userProfile', sectionName: 'User Profile', isExpanded: true },
            { sectionKey: 'accessAndPermissions', sectionName: 'Access and Permissions', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

