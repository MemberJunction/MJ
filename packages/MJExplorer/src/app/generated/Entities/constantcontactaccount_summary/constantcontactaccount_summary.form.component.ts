import { Component } from '@angular/core';
import { constantcontactaccount_summaryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Account Summaries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactaccount_summary-form',
    templateUrl: './constantcontactaccount_summary.form.component.html'
})
export class constantcontactaccount_summaryFormComponent extends BaseFormComponent {
    public record!: constantcontactaccount_summaryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

