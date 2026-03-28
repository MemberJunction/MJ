import { Component } from '@angular/core';
import { AssociationDemoCertificationTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Certification Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemocertificationtype-form',
    templateUrl: './associationdemocertificationtype.form.component.html'
})
export class AssociationDemoCertificationTypeFormComponent extends BaseFormComponent {
    public record!: AssociationDemoCertificationTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'certificationRequirements', sectionName: 'Certification Requirements', isExpanded: false },
            { sectionKey: 'certifications', sectionName: 'Certifications', isExpanded: false }
        ]);
    }
}

