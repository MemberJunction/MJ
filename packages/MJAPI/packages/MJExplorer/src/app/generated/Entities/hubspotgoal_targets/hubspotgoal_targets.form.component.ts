import { Component } from '@angular/core';
import { hubspotgoal_targetsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Goal Targets') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotgoal_targets-form',
    templateUrl: './hubspotgoal_targets.form.component.html'
})
export class hubspotgoal_targetsFormComponent extends BaseFormComponent {
    public record!: hubspotgoal_targetsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'goalInformation', sectionName: 'Goal Information', isExpanded: true },
            { sectionKey: 'timeline', sectionName: 'Timeline', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

