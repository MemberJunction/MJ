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
            { sectionKey: 'claimTypeDetails', sectionName: 'Claim Type Details', isExpanded: true },
            { sectionKey: 'integrationAndBehavior', sectionName: 'Integration and Behavior', isExpanded: true },
            { sectionKey: 'claimLifecycle', sectionName: 'Claim Lifecycle', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJIdentityClaims', sectionName: 'Identity Claims', isExpanded: false }
        ]);
    }
}

