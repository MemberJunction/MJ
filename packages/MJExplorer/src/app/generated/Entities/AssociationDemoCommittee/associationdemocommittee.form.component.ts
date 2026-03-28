import { Component } from '@angular/core';
import { AssociationDemoCommitteeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Committees') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemocommittee-form',
    templateUrl: './associationdemocommittee.form.component.html'
})
export class AssociationDemoCommitteeFormComponent extends BaseFormComponent {
    public record!: AssociationDemoCommitteeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'committeeMemberships', sectionName: 'Committee Memberships', isExpanded: false }
        ]);
    }
}

