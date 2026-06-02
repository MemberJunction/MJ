import { Component } from '@angular/core';
import { hubspotcoursesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Courses') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcourses-form',
    templateUrl: './hubspotcourses.form.component.html'
})
export class hubspotcoursesFormComponent extends BaseFormComponent {
    public record!: hubspotcoursesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'courseStatusAndPipeline', sectionName: 'Course Status and Pipeline', isExpanded: true },
            { sectionKey: 'ownershipAndAccess', sectionName: 'Ownership and Access', isExpanded: true },
            { sectionKey: 'courseInformation', sectionName: 'Course Information', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

