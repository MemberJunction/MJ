import { Component } from '@angular/core';
import { constantcontactactivities_contacts_file_importEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Activities Contacts File Imports') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactactivities_contacts_file_import-form',
    templateUrl: './constantcontactactivities_contacts_file_import.form.component.html'
})
export class constantcontactactivities_contacts_file_importFormComponent extends BaseFormComponent {
    public record!: constantcontactactivities_contacts_file_importEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

