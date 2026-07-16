import { Component } from '@angular/core';
import { constantcontactcontacts_sign_up_formEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contacts Sign Up Forms') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactcontacts_sign_up_form-form',
    templateUrl: './constantcontactcontacts_sign_up_form.form.component.html'
})
export class constantcontactcontacts_sign_up_formFormComponent extends BaseFormComponent {
    public record!: constantcontactcontacts_sign_up_formEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

