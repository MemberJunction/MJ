import { Component } from '@angular/core';
import { constantcontactcontact_reports_open_and_click_ratesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Reports Open And Click Rates') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactcontact_reports_open_and_click_rates-form',
    templateUrl: './constantcontactcontact_reports_open_and_click_rates.form.component.html'
})
export class constantcontactcontact_reports_open_and_click_ratesFormComponent extends BaseFormComponent {
    public record!: constantcontactcontact_reports_open_and_click_ratesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

