import { Component } from '@angular/core';
import { CredentialEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Credentials') // Tell MemberJunction about this class
@Component({
    selector: 'gen-credential-form',
    templateUrl: './credential.form.component.html'
})
export class CredentialFormComponent extends BaseFormComponent {
    public record!: CredentialEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'classification', sectionName: 'Classification', isExpanded: true },
            { sectionKey: 'basicInformation', sectionName: 'Basic Information', isExpanded: true },
            { sectionKey: 'accessDetails', sectionName: 'Access Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJFileStorageAccounts', sectionName: 'MJ: File Storage Accounts', isExpanded: false },
            { sectionKey: 'mJMCPServerConnections', sectionName: 'MJ: MCP Server Connections', isExpanded: false },
            { sectionKey: 'mJAICredentialBindings', sectionName: 'MJ: AI Credential Bindings', isExpanded: false }
        ]);
    }
}

export function LoadCredentialFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
