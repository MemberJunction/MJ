import { Component } from '@angular/core';
import { constantcontactcontact_tagsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactcontact_tags-form',
    templateUrl: './constantcontactcontact_tags.form.component.html'
})
export class constantcontactcontact_tagsFormComponent extends BaseFormComponent {
    public record!: constantcontactcontact_tagsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

