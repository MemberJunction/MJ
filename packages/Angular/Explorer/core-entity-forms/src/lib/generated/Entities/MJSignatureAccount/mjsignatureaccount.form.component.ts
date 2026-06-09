import { Component } from '@angular/core';
import { MJSignatureAccountEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Signature Accounts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsignatureaccount-form',
    templateUrl: './mjsignatureaccount.form.component.html'
})
export class MJSignatureAccountFormComponent extends BaseFormComponent {
    public record!: MJSignatureAccountEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'accountDetails', sectionName: 'Account Details', isExpanded: true },
            { sectionKey: 'accountConfiguration', sectionName: 'Account Configuration', isExpanded: true },
            { sectionKey: 'accountStatus', sectionName: 'Account Status', isExpanded: true },
            { sectionKey: 'senderSettings', sectionName: 'Sender Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJSignatureRequests', sectionName: 'Signature Requests', isExpanded: false }
        ]);
    }
}

