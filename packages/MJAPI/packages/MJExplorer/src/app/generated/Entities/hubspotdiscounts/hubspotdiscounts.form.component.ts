import { Component } from '@angular/core';
import { hubspotdiscountsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Discounts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotdiscounts-form',
    templateUrl: './hubspotdiscounts.form.component.html'
})
export class hubspotdiscountsFormComponent extends BaseFormComponent {
    public record!: hubspotdiscountsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'discountDetails', sectionName: 'Discount Details', isExpanded: true },
            { sectionKey: 'ownershipAndAssignment', sectionName: 'Ownership and Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

