import { Component } from '@angular/core';
import { constantcontactactivities_custom_fields_deleteEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Activities Custom Fields Deletes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactactivities_custom_fields_delete-form',
    templateUrl: './constantcontactactivities_custom_fields_delete.form.component.html'
})
export class constantcontactactivities_custom_fields_deleteFormComponent extends BaseFormComponent {
    public record!: constantcontactactivities_custom_fields_deleteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

