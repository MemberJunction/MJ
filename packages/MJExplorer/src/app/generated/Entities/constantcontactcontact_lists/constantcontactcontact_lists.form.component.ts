import { Component } from '@angular/core';
import { constantcontactcontact_listsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Contact Lists') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactcontact_lists-form',
    templateUrl: './constantcontactcontact_lists.form.component.html'
})
export class constantcontactcontact_listsFormComponent extends BaseFormComponent {
    public record!: constantcontactcontact_listsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'contactListsXrefs', sectionName: 'Contact Lists Xrefs', isExpanded: false },
            { sectionKey: 'emailReportsLinks', sectionName: 'Email Reports Links', isExpanded: false }
        ]);
    }
}

