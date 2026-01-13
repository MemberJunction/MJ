import { Component } from '@angular/core';
import { ProductCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Product Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productcategory-form',
    templateUrl: './productcategory.form.component.html'
})
export class ProductCategoryFormComponent extends BaseFormComponent {
    public record!: ProductCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'productCategories', sectionName: 'Product Categories', isExpanded: false },
            { sectionKey: 'competitionEntries', sectionName: 'Competition Entries', isExpanded: false },
            { sectionKey: 'products', sectionName: 'Products', isExpanded: false }
        ]);
    }
}

export function LoadProductCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
