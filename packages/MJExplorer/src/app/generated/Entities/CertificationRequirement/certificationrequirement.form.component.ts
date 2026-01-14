import { Component } from '@angular/core';
import { CertificationRequirementEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Certification Requirements') // Tell MemberJunction about this class
@Component({
    selector: 'gen-certificationrequirement-form',
    templateUrl: './certificationrequirement.form.component.html'
})
export class CertificationRequirementFormComponent extends BaseFormComponent {
    public record!: CertificationRequirementEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadCertificationRequirementFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
