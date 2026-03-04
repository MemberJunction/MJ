import { Component } from '@angular/core';
import { PaymentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Payments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-payment-form',
    templateUrl: './payment.form.component.html'
})
export class PaymentFormComponent extends BaseFormComponent {
    public record!: PaymentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

