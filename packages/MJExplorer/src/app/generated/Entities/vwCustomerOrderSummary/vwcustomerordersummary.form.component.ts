import { Component } from '@angular/core';
import { vwCustomerOrderSummaryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Customer Order Summaries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-vwcustomerordersummary-form',
    templateUrl: './vwcustomerordersummary.form.component.html'
})
export class vwCustomerOrderSummaryFormComponent extends BaseFormComponent {
    public record!: vwCustomerOrderSummaryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

