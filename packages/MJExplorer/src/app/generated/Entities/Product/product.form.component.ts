import { Component } from '@angular/core';
import { ProductEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Products') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-product-form',
    templateUrl: './product.form.component.html'
})
export class ProductFormComponent extends BaseFormComponent {
    public record!: ProductEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'productDetails', sectionName: 'Product Details', isExpanded: true },
            { sectionKey: 'pricingInventory', sectionName: 'Pricing & Inventory', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'meetings', sectionName: 'Meetings', isExpanded: false },
            { sectionKey: 'publications', sectionName: 'Publications', isExpanded: false }
        ]);
    }
}

