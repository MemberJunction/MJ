import { Component } from '@angular/core';
import { DogShelterAdoptionApplicationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Adoption Applications') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dogshelteradoptionapplication-form',
    templateUrl: './dogshelteradoptionapplication.form.component.html'
})
export class DogShelterAdoptionApplicationFormComponent extends BaseFormComponent {
    public record!: DogShelterAdoptionApplicationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'applicationContext', sectionName: 'Application Context', isExpanded: true },
            { sectionKey: 'applicationTimeline', sectionName: 'Application Timeline', isExpanded: true },
            { sectionKey: 'workflowAndReview', sectionName: 'Workflow and Review', isExpanded: true },
            { sectionKey: 'financials', sectionName: 'Financials', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

