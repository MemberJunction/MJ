import { Component } from '@angular/core';
import { AssociationDemoLegislativeBodyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Legislative Bodies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemolegislativebody-form',
    templateUrl: './associationdemolegislativebody.form.component.html'
})
export class AssociationDemoLegislativeBodyFormComponent extends BaseFormComponent {
    public record!: AssociationDemoLegislativeBodyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'governmentContacts', sectionName: 'Government Contacts', isExpanded: false },
            { sectionKey: 'legislativeIssues', sectionName: 'Legislative Issues', isExpanded: false }
        ]);
    }
}

