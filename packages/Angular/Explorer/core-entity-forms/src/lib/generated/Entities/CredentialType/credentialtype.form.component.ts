import { Component } from '@angular/core';
import { CredentialTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Credential Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-credentialtype-form',
    templateUrl: './credentialtype.form.component.html'
})
export class CredentialTypeFormComponent extends BaseFormComponent {
    public record!: CredentialTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'technicalDetails', sectionName: 'Technical Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJCredentials', sectionName: 'MJ: Credentials', isExpanded: false },
            { sectionKey: 'mJMCPServers', sectionName: 'MJ: MCP Servers', isExpanded: false },
            { sectionKey: 'mJAIVendors', sectionName: 'MJ: AI Vendors', isExpanded: false }
        ]);
    }
}

