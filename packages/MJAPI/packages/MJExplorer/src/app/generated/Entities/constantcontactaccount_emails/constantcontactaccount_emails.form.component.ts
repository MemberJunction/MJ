import { Component } from '@angular/core';
import { constantcontactaccount_emailsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Account Emails') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactaccount_emails-form',
    templateUrl: './constantcontactaccount_emails.form.component.html'
})
export class constantcontactaccount_emailsFormComponent extends BaseFormComponent {
    public record!: constantcontactaccount_emailsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

