import { Component } from '@angular/core';
import { YourMembershipMembershipEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Memberships') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipmembership-form',
    templateUrl: './yourmembershipmembership.form.component.html'
})
export class YourMembershipMembershipFormComponent extends BaseFormComponent {
    public record!: YourMembershipMembershipEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'membershipDefinition', sectionName: 'Membership Definition', isExpanded: true },
            { sectionKey: 'duesAndBilling', sectionName: 'Dues and Billing', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'membershipModifiers', sectionName: 'Membership Modifiers', isExpanded: false },
            { sectionKey: 'membershipPromoCodes', sectionName: 'Membership Promo Codes', isExpanded: false }
        ]);
    }
}

