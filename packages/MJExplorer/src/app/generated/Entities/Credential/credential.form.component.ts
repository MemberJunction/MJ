import { Component } from '@angular/core';
import { CredentialEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Credentials') // Tell MemberJunction about this class
@Component({
    selector: 'gen-credential-form',
    templateUrl: './credential.form.component.html'
})
export class CredentialFormComponent extends BaseFormComponent {
    public record!: CredentialEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'association', sectionName: 'Association', isExpanded: true },
            { sectionKey: 'credentialDetails', sectionName: 'Credential Details', isExpanded: true },
            { sectionKey: 'securityLifecycle', sectionName: 'Security & Lifecycle', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'channelActions', sectionName: 'Channel Actions', isExpanded: false },
            { sectionKey: 'channelTypeActions', sectionName: 'Channel Type Actions', isExpanded: false },
            { sectionKey: 'organizationActions', sectionName: 'Organization Actions', isExpanded: false },
            { sectionKey: 'channels', sectionName: 'Channels', isExpanded: false }
        ]);
    }
}

export function LoadCredentialFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
