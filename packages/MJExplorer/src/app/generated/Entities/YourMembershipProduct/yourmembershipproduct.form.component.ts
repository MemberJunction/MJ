import { Component } from '@angular/core';
import { YourMembershipProductEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Products') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipproduct-form',
    templateUrl: './yourmembershipproduct.form.component.html'
})
export class YourMembershipProductFormComponent extends BaseFormComponent {
    public record!: YourMembershipProductEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'productDetails', sectionName: 'Product Details', isExpanded: true },
            { sectionKey: 'pricingAndInventory', sectionName: 'Pricing and Inventory', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

