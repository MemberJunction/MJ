import { Component } from '@angular/core';
import { AssociationDemoPaymentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Payments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemopayment-form',
    templateUrl: './associationdemopayment.form.component.html'
})
export class AssociationDemoPaymentFormComponent extends BaseFormComponent {
    public record!: AssociationDemoPaymentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'paymentDetails', sectionName: 'Payment Details', isExpanded: true },
            { sectionKey: 'transactionProcessing', sectionName: 'Transaction Processing', isExpanded: true },
            { sectionKey: 'additionalInformation', sectionName: 'Additional Information', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

