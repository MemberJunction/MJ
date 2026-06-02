import { Component } from '@angular/core';
import { hubspotusersEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Users') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotusers-form',
    templateUrl: './hubspotusers.form.component.html'
})
export class hubspotusersFormComponent extends BaseFormComponent {
    public record!: hubspotusersEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'workflowAndSettings', sectionName: 'Workflow and Settings', isExpanded: true },
            { sectionKey: 'userProfile', sectionName: 'User Profile', isExpanded: true },
            { sectionKey: 'accountAccess', sectionName: 'Account Access', isExpanded: false },
            { sectionKey: 'teamAndHierarchy', sectionName: 'Team and Hierarchy', isExpanded: false },
            { sectionKey: 'partnerInformation', sectionName: 'Partner Information', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

