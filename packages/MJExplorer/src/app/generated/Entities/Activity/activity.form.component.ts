import { Component } from '@angular/core';
import { ActivityEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Activities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-activity-form',
    templateUrl: './activity.form.component.html'
})
export class ActivityFormComponent extends BaseFormComponent {
    public record!: ActivityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

