import { Component } from '@angular/core';
import { YourMembershipFinanceBatchEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Finance Batches') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipfinancebatch-form',
    templateUrl: './yourmembershipfinancebatch.form.component.html'
})
export class YourMembershipFinanceBatchFormComponent extends BaseFormComponent {
    public record!: YourMembershipFinanceBatchEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'batchDetails', sectionName: 'Batch Details', isExpanded: true },
            { sectionKey: 'processingTimeline', sectionName: 'Processing Timeline', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'financeBatchDetails', sectionName: 'Finance Batch Details', isExpanded: false }
        ]);
    }
}

