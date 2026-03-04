import { Component } from '@angular/core';
import { CustomerOrderEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Customer Orders') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-customerorder-form',
    templateUrl: './customerorder.form.component.html'
})
export class CustomerOrderFormComponent extends BaseFormComponent {
    public record!: CustomerOrderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'orderItems', sectionName: 'Order Items', isExpanded: false }
        ]);
    }
}

