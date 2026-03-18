import { Component } from '@angular/core';
import { YourMembershipFinanceBatchDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Finance Batch Details') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipfinancebatchdetail-form',
    templateUrl: './yourmembershipfinancebatchdetail.form.component.html'
})
export class YourMembershipFinanceBatchDetailFormComponent extends BaseFormComponent {
    public record!: YourMembershipFinanceBatchDetailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'batchAndInvoiceDetails', sectionName: 'Batch and Invoice Details', isExpanded: true },
            { sectionKey: 'financialInformation', sectionName: 'Financial Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

