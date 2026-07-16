import { Component } from '@angular/core';
import { constantcontactactivities_list_deleteEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Activities List Deletes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactactivities_list_delete-form',
    templateUrl: './constantcontactactivities_list_delete.form.component.html'
})
export class constantcontactactivities_list_deleteFormComponent extends BaseFormComponent {
    public record!: constantcontactactivities_list_deleteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

