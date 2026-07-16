import { Component } from '@angular/core';
import { constantcontactemail_reports_summaryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Email Reports Summaries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactemail_reports_summary-form',
    templateUrl: './constantcontactemail_reports_summary.form.component.html'
})
export class constantcontactemail_reports_summaryFormComponent extends BaseFormComponent {
    public record!: constantcontactemail_reports_summaryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

