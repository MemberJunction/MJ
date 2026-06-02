import { Component } from '@angular/core';
import { hubspotfeesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Fees') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotfees-form',
    templateUrl: './hubspotfees.form.component.html'
})
export class hubspotfeesFormComponent extends BaseFormComponent {
    public record!: hubspotfeesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'feeDetails', sectionName: 'Fee Details', isExpanded: true },
            { sectionKey: 'ownershipAndAssignment', sectionName: 'Ownership and Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

