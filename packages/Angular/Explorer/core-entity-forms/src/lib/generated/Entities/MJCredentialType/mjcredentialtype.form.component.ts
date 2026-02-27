import { Component } from '@angular/core';
import { MJCredentialTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Credential Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcredentialtype-form',
    templateUrl: './mjcredentialtype.form.component.html'
})
export class MJCredentialTypeFormComponent extends BaseFormComponent {
    public record!: MJCredentialTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'technicalDetails', sectionName: 'Technical Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJCredentials', sectionName: 'Credentials', isExpanded: false },
            { sectionKey: 'mJMCPServers', sectionName: 'MCP Servers', isExpanded: false },
            { sectionKey: 'mJAIVendors', sectionName: 'AI Vendors', isExpanded: false }
        ]);
    }
}

