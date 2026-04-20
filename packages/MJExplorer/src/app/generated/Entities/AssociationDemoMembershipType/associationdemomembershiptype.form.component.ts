import { Component } from '@angular/core';
import { AssociationDemoMembershipTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Membership Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemomembershiptype-form',
    templateUrl: './associationdemomembershiptype.form.component.html'
})
export class AssociationDemoMembershipTypeFormComponent extends BaseFormComponent {
    public record!: AssociationDemoMembershipTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'membershipConfiguration', sectionName: 'Membership Configuration', isExpanded: true },
            { sectionKey: 'financialAndRenewalTerms', sectionName: 'Financial and Renewal Terms', isExpanded: true },
            { sectionKey: 'operationalSettings', sectionName: 'Operational Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'memberships', sectionName: 'Memberships', isExpanded: false }
        ]);
    }
}

