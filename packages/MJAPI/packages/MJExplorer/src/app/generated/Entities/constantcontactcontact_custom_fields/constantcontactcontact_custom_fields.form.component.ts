import { Component } from '@angular/core';
import { constantcontactcontact_custom_fieldsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Custom Fields') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactcontact_custom_fields-form',
    templateUrl: './constantcontactcontact_custom_fields.form.component.html'
})
export class constantcontactcontact_custom_fieldsFormComponent extends BaseFormComponent {
    public record!: constantcontactcontact_custom_fieldsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

