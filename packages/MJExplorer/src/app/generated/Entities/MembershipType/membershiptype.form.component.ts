import { Component } from '@angular/core';
import { MembershipTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Membership Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-membershiptype-form',
    templateUrl: './membershiptype.form.component.html'
})
export class MembershipTypeFormComponent extends BaseFormComponent {
    public record!: MembershipTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'membershipOverview', sectionName: 'Membership Overview', isExpanded: true },
            { sectionKey: 'pricingRenewal', sectionName: 'Pricing & Renewal', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'memberships', sectionName: 'Memberships', isExpanded: false }
        ]);
    }
}

export function LoadMembershipTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
