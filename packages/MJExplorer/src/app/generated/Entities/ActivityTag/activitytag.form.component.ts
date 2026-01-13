import { Component } from '@angular/core';
import { ActivityTagEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Activity Tags') // Tell MemberJunction about this class
@Component({
    selector: 'gen-activitytag-form',
    templateUrl: './activitytag.form.component.html'
})
export class ActivityTagFormComponent extends BaseFormComponent {
    public record!: ActivityTagEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tagDefinition', sectionName: 'Tag Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadActivityTagFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
