import { Component } from '@angular/core';
import { AssociationDemoCertificationRequirementEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Certification Requirements') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemocertificationrequirement-form',
    templateUrl: './associationdemocertificationrequirement.form.component.html'
})
export class AssociationDemoCertificationRequirementFormComponent extends BaseFormComponent {
    public record!: AssociationDemoCertificationRequirementEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'certificationInformation', sectionName: 'Certification Information', isExpanded: true },
            { sectionKey: 'requirementDetails', sectionName: 'Requirement Details', isExpanded: true },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

