import { Component } from '@angular/core';
import { constantcontactactivities_list_memberships_addEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Activities List Memberships Adds') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactactivities_list_memberships_add-form',
    templateUrl: './constantcontactactivities_list_memberships_add.form.component.html'
})
export class constantcontactactivities_list_memberships_addFormComponent extends BaseFormComponent {
    public record!: constantcontactactivities_list_memberships_addEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

