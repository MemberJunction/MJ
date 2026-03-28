import { Component } from '@angular/core';
import { AssociationDemoCertificationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Certifications') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemocertification-form',
    templateUrl: './associationdemocertification.form.component.html'
})
export class AssociationDemoCertificationFormComponent extends BaseFormComponent {
    public record!: AssociationDemoCertificationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'certificationRenewals', sectionName: 'Certification Renewals', isExpanded: false },
            { sectionKey: 'continuingEducations', sectionName: 'Continuing Educations', isExpanded: false }
        ]);
    }
}

