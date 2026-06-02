import { Component } from '@angular/core';
import { hubspotproductsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Products') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotproducts-form',
    templateUrl: './hubspotproducts.form.component.html'
})
export class hubspotproductsFormComponent extends BaseFormComponent {
    public record!: hubspotproductsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'productDetails', sectionName: 'Product Details', isExpanded: true },
            { sectionKey: 'pricingAndBilling', sectionName: 'Pricing and Billing', isExpanded: true },
            { sectionKey: 'ownershipAndAudit', sectionName: 'Ownership and Audit', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

