import { Component } from '@angular/core';
import { CertificationTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Certification Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-certificationtype-form',
    templateUrl: './certificationtype.form.component.html'
})
export class CertificationTypeFormComponent extends BaseFormComponent {
    public record!: CertificationTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'certificationRequirements', sectionName: 'Certification Requirements', isExpanded: false },
            { sectionKey: 'certifications', sectionName: 'Certifications', isExpanded: false }
        ]);
    }
}

export function LoadCertificationTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
