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
            { sectionKey: 'providerConfiguration', sectionName: 'Provider Configuration', isExpanded: true },
            { sectionKey: 'capabilitiesAndSecurity', sectionName: 'Capabilities and Security', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJSignatureAccounts', sectionName: 'Signature Accounts', isExpanded: false }
        ]);
    }
}

