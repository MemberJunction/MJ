import { Component } from '@angular/core';
import { ProductEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

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
            { sectionKey: 'productEssentials', sectionName: 'Product Essentials', isExpanded: true },
            { sectionKey: 'mediaDescriptions', sectionName: 'Media & Descriptions', isExpanded: true },
            { sectionKey: 'cheeseCharacteristics', sectionName: 'Cheese Characteristics', isExpanded: false },
            { sectionKey: 'pricingAvailability', sectionName: 'Pricing & Availability', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'competitionEntries', sectionName: 'Competition Entries', isExpanded: false },
            { sectionKey: 'productAwards', sectionName: 'Product Awards', isExpanded: false }
        ]);
    }
}

export function LoadProductFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
