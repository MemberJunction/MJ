import { Component } from '@angular/core';
import { MJSignatureProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Signature Providers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsignatureprovider-form',
    templateUrl: './mjsignatureprovider.form.component.html'
})
export class MJSignatureProviderFormComponent extends BaseFormComponent {
    public record!: MJSignatureProviderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'providerDefinition', sectionName: 'Provider Definition', isExpanded: true },
            { sectionKey: 'providerAvailability', sectionName: 'Provider Availability', isExpanded: true },
            { sectionKey: 'authenticationSettings', sectionName: 'Authentication Settings', isExpanded: true },
            { sectionKey: 'featureCapabilities', sectionName: 'Feature Capabilities', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJSignatureAccounts', sectionName: 'Signature Accounts', isExpanded: false }
        ]);
    }
}

