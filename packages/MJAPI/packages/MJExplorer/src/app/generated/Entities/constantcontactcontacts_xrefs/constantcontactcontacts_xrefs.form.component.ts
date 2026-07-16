import { Component } from '@angular/core';
import { constantcontactcontacts_xrefsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contacts Xrefs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactcontacts_xrefs-form',
    templateUrl: './constantcontactcontacts_xrefs.form.component.html'
})
export class constantcontactcontacts_xrefsFormComponent extends BaseFormComponent {
    public record!: constantcontactcontacts_xrefsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

