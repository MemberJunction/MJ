import { Component } from '@angular/core';
import { CertificationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Certifications') // Tell MemberJunction about this class
@Component({
    selector: 'gen-certification-form',
    templateUrl: './certification.form.component.html'
})
export class CertificationFormComponent extends BaseFormComponent {
    public record!: CertificationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'certificationOverview', sectionName: 'Certification Overview', isExpanded: true },
            { sectionKey: 'timeline', sectionName: 'Timeline', isExpanded: true },
            { sectionKey: 'performanceCredits', sectionName: 'Performance & Credits', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'certificationRenewals', sectionName: 'Certification Renewals', isExpanded: false },
            { sectionKey: 'continuingEducations', sectionName: 'Continuing Educations', isExpanded: false }
        ]);
    }
}

export function LoadCertificationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
