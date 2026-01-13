import { Component } from '@angular/core';
import { ActivityTagLinkEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Activity Tag Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-activitytaglink-form',
    templateUrl: './activitytaglink.form.component.html'
})
export class ActivityTagLinkFormComponent extends BaseFormComponent {
    public record!: ActivityTagLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tagAssignment', sectionName: 'Tag Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadActivityTagLinkFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
