import { Component } from '@angular/core';
import { TrainerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Trainers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-trainer-form',
    templateUrl: './trainer.form.component.html'
})
export class TrainerFormComponent extends BaseFormComponent {
    public record!: TrainerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'fitnessClasses', sectionName: 'Fitness Classes', isExpanded: false },
            { sectionKey: 'personalTrainingSessions', sectionName: 'Personal Training Sessions', isExpanded: false }
        ]);
    }
}

