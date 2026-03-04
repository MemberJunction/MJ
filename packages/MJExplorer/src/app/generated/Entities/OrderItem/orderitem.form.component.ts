import { Component } from '@angular/core';
import { OrderItemEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Order Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-orderitem-form',
    templateUrl: './orderitem.form.component.html'
})
export class OrderItemFormComponent extends BaseFormComponent {
    public record!: OrderItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

