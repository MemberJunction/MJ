import { Component } from '@angular/core';
import { YourMembershipPaymentProcessorEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Payment Processors') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershippaymentprocessor-form',
    templateUrl: './yourmembershippaymentprocessor.form.component.html'
})
export class YourMembershipPaymentProcessorFormComponent extends BaseFormComponent {
    public record!: YourMembershipPaymentProcessorEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'processorConfiguration', sectionName: 'Processor Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

