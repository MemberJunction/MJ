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
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'competitionEntries', sectionName: 'Competition Entries', isExpanded: false },
            { sectionKey: 'productAwards', sectionName: 'Product Awards', isExpanded: false }
        ]);
    }
}

