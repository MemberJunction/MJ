import { Component } from '@angular/core';
import { constantcontactcontact_lists_xrefsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Lists Xrefs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactcontact_lists_xrefs-form',
    templateUrl: './constantcontactcontact_lists_xrefs.form.component.html'
})
export class constantcontactcontact_lists_xrefsFormComponent extends BaseFormComponent {
    public record!: constantcontactcontact_lists_xrefsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

