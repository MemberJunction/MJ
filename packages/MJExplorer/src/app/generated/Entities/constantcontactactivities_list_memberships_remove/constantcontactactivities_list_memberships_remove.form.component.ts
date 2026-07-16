import { Component } from '@angular/core';
import { constantcontactactivities_list_memberships_removeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Activities List Memberships Removes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactactivities_list_memberships_remove-form',
    templateUrl: './constantcontactactivities_list_memberships_remove.form.component.html'
})
export class constantcontactactivities_list_memberships_removeFormComponent extends BaseFormComponent {
    public record!: constantcontactactivities_list_memberships_removeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

