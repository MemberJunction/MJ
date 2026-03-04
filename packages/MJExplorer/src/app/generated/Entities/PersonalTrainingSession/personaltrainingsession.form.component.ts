import { Component } from '@angular/core';
import { PersonalTrainingSessionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Personal Training Sessions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-personaltrainingsession-form',
    templateUrl: './personaltrainingsession.form.component.html'
})
export class PersonalTrainingSessionFormComponent extends BaseFormComponent {
    public record!: PersonalTrainingSessionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

