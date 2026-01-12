import { Component } from '@angular/core';
import { CertificateEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Certificates') // Tell MemberJunction about this class
@Component({
    selector: 'gen-certificate-form',
    templateUrl: './certificate.form.component.html'
})
export class CertificateFormComponent extends BaseFormComponent {
    public record!: CertificateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identification', sectionName: 'Identification', isExpanded: true },
            { sectionKey: 'accessValidity', sectionName: 'Access & Validity', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadCertificateFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
