import { Component } from '@angular/core';
import { CertificationRenewalEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Certification Renewals') // Tell MemberJunction about this class
@Component({
    selector: 'gen-certificationrenewal-form',
    templateUrl: './certificationrenewal.form.component.html'
})
export class CertificationRenewalFormComponent extends BaseFormComponent {
    public record!: CertificationRenewalEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadCertificationRenewalFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
