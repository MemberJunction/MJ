import { Component } from '@angular/core';
import { constantcontactaccount_user_privilegesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Account User Privileges') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactaccount_user_privileges-form',
    templateUrl: './constantcontactaccount_user_privileges.form.component.html'
})
export class constantcontactaccount_user_privilegesFormComponent extends BaseFormComponent {
    public record!: constantcontactaccount_user_privilegesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

