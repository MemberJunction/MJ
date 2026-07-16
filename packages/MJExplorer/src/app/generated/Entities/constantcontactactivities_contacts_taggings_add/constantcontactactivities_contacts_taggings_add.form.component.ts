import { Component } from '@angular/core';
import { constantcontactactivities_contacts_taggings_addEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Activities Contacts Taggings Adds') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactactivities_contacts_taggings_add-form',
    templateUrl: './constantcontactactivities_contacts_taggings_add.form.component.html'
})
export class constantcontactactivities_contacts_taggings_addFormComponent extends BaseFormComponent {
    public record!: constantcontactactivities_contacts_taggings_addEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

