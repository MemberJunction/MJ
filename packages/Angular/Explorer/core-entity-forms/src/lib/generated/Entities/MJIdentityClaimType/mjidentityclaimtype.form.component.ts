import { Component } from '@angular/core';
import { MJIdentityClaimTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Identity Claim Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjidentityclaimtype-form',
    templateUrl: './mjidentityclaimtype.form.component.html'
})
export class MJIdentityClaimTypeFormComponent extends BaseFormComponent {
    public record!: MJIdentityClaimTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'claimTypeDefinition', sectionName: 'Claim Type Definition', isExpanded: true },
            { sectionKey: 'implementationDetails', sectionName: 'Implementation Details', isExpanded: true },
            { sectionKey: 'lifecycleSettings', sectionName: 'Lifecycle Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJIdentityClaims', sectionName: 'Identity Claims', isExpanded: false }
        ]);
    }
}

