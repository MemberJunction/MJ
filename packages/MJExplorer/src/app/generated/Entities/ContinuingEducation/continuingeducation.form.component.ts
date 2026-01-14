import { Component } from '@angular/core';
import { ContinuingEducationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Continuing Educations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-continuingeducation-form',
    templateUrl: './continuingeducation.form.component.html'
})
export class ContinuingEducationFormComponent extends BaseFormComponent {
    public record!: ContinuingEducationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadContinuingEducationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
