import { Component } from '@angular/core';
import { OrganizationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Organizations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-organization-form',
    templateUrl: './organization.form.component.html'
})
export class OrganizationFormComponent extends BaseFormComponent {
    public record!: OrganizationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'basicInformation', sectionName: 'Basic Information', isExpanded: true },
            { sectionKey: 'hierarchy', sectionName: 'Hierarchy', isExpanded: true },
            { sectionKey: 'subscription', sectionName: 'Subscription', isExpanded: false },
            { sectionKey: 'aIDomainSettings', sectionName: 'AI & Domain Settings', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'aPIKeys', sectionName: 'API Keys', isExpanded: false },
            { sectionKey: 'channels', sectionName: 'Channels', isExpanded: false },
            { sectionKey: 'credentials', sectionName: 'Credentials', isExpanded: false },
            { sectionKey: 'izzyActionOrganizations', sectionName: 'Izzy Action Organizations', isExpanded: false },
            { sectionKey: 'organizationActions', sectionName: 'Organization Actions', isExpanded: false },
            { sectionKey: 'organizationSettings', sectionName: 'Organization Settings', isExpanded: false },
            { sectionKey: 'organizations', sectionName: 'Organizations', isExpanded: false },
            { sectionKey: 'channelTypeActions', sectionName: 'Channel Type Actions', isExpanded: false },
            { sectionKey: 'organizationContacts', sectionName: 'Organization Contacts', isExpanded: false }
        ]);
    }
}

export function LoadOrganizationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
