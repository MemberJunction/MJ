import { Component } from '@angular/core';
import { AssociationDemoProductCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Product Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoproductcategory-form',
    templateUrl: './associationdemoproductcategory.form.component.html'
})
export class AssociationDemoProductCategoryFormComponent extends BaseFormComponent {
    public record!: AssociationDemoProductCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'hierarchyAndOrdering', sectionName: 'Hierarchy and Ordering', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'productCategories', sectionName: 'Product Categories', isExpanded: false },
            { sectionKey: 'products', sectionName: 'Products', isExpanded: false },
            { sectionKey: 'competitionEntries', sectionName: 'Competition Entries', isExpanded: false }
        ]);
    }
}

