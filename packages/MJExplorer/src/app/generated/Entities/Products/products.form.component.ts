import { Component } from '@angular/core';
import { ProductsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Products') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-products-form',
    templateUrl: './products.form.component.html'
})
export class ProductsFormComponent extends BaseFormComponent {
    public record!: ProductsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'dealProducts', sectionName: 'Deal Products', isExpanded: false }
        ]);
    }
}

