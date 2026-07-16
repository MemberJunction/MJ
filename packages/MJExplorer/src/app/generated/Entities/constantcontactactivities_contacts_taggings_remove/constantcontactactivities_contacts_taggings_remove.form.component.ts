import { Component } from '@angular/core';
import { constantcontactactivities_contacts_taggings_removeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Activities Contacts Taggings Removes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactactivities_contacts_taggings_remove-form',
    templateUrl: './constantcontactactivities_contacts_taggings_remove.form.component.html'
})
export class constantcontactactivities_contacts_taggings_removeFormComponent extends BaseFormComponent {
    public record!: constantcontactactivities_contacts_taggings_removeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

