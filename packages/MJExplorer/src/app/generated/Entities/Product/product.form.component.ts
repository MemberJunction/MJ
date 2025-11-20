import { Component } from '@angular/core';
import { ProductEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Products') // Tell MemberJunction about this class
@Component({
    selector: 'gen-product-form',
    templateUrl: './product.form.component.html'
})
export class ProductFormComponent extends BaseFormComponent {
    public record!: ProductEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'dealProducts', sectionName: 'Deal Products', isExpanded: false },
            { sectionKey: 'invoiceLineItems', sectionName: 'Invoice Line Items', isExpanded: false }
        ]);
    }
}

export function LoadProductFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
