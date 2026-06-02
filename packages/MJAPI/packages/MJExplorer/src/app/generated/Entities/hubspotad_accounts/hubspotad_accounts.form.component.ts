import { Component } from '@angular/core';
import { hubspotad_accountsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Ad Accounts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotad_accounts-form',
    templateUrl: './hubspotad_accounts.form.component.html'
})
export class hubspotad_accountsFormComponent extends BaseFormComponent {
    public record!: hubspotad_accountsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'accountDetails', sectionName: 'Account Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

