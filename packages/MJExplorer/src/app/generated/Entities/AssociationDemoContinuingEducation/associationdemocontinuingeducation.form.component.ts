import { Component } from '@angular/core';
import { AssociationDemoContinuingEducationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Continuing Educations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemocontinuingeducation-form',
    templateUrl: './associationdemocontinuingeducation.form.component.html'
})
export class AssociationDemoContinuingEducationFormComponent extends BaseFormComponent {
    public record!: AssociationDemoContinuingEducationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'activityInformation', sectionName: 'Activity Information', isExpanded: true },
            { sectionKey: 'creditsAndVerification', sectionName: 'Credits and Verification', isExpanded: false },
            { sectionKey: 'statusAndDocumentation', sectionName: 'Status and Documentation', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

