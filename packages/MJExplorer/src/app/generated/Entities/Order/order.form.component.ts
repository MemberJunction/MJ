import { Component } from '@angular/core';
import { OrderEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Orders') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-order-form',
    templateUrl: './order.form.component.html'
})
export class OrderFormComponent extends BaseFormComponent {
    public record!: OrderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'orderSummary', sectionName: 'Order Summary', isExpanded: true },
            { sectionKey: 'fulfillment', sectionName: 'Fulfillment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

