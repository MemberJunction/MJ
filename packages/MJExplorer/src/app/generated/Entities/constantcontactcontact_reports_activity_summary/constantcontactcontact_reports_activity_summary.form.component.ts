import { Component } from '@angular/core';
import { constantcontactcontact_reports_activity_summaryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Reports Activity Summaries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactcontact_reports_activity_summary-form',
    templateUrl: './constantcontactcontact_reports_activity_summary.form.component.html'
})
export class constantcontactcontact_reports_activity_summaryFormComponent extends BaseFormComponent {
    public record!: constantcontactcontact_reports_activity_summaryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

