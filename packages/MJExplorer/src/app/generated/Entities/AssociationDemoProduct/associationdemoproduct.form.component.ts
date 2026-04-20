import { Component } from '@angular/core';
import { AssociationDemoProductEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Products') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoproduct-form',
    templateUrl: './associationdemoproduct.form.component.html'
})
export class AssociationDemoProductFormComponent extends BaseFormComponent {
    public record!: AssociationDemoProductEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'productDetails', sectionName: 'Product Details', isExpanded: true },
            { sectionKey: 'productCharacteristics', sectionName: 'Product Characteristics', isExpanded: true },
            { sectionKey: 'pricingAndSpecifications', sectionName: 'Pricing and Specifications', isExpanded: false },
            { sectionKey: 'marketingAndNotes', sectionName: 'Marketing and Notes', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'competitionEntries', sectionName: 'Competition Entries', isExpanded: false },
            { sectionKey: 'productAwards', sectionName: 'Product Awards', isExpanded: false }
        ]);
    }
}

