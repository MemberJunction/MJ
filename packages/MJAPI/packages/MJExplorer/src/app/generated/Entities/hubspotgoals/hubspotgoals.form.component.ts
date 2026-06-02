import { Component } from '@angular/core';
import { hubspotgoalsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Goals') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotgoals-form',
    templateUrl: './hubspotgoals.form.component.html'
})
export class hubspotgoalsFormComponent extends BaseFormComponent {
    public record!: hubspotgoalsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'timeline', sectionName: 'Timeline', isExpanded: true },
            { sectionKey: 'goalOverview', sectionName: 'Goal Overview', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

