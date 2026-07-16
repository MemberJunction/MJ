import { Component } from '@angular/core';
import { constantcontactactivities_contacts_deleteEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Activities Contacts Deletes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactactivities_contacts_delete-form',
    templateUrl: './constantcontactactivities_contacts_delete.form.component.html'
})
export class constantcontactactivities_contacts_deleteFormComponent extends BaseFormComponent {
    public record!: constantcontactactivities_contacts_deleteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

