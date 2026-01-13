import { Component } from '@angular/core';
import { ForumModerationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Forum Moderations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-forummoderation-form',
    templateUrl: './forummoderation.form.component.html'
})
export class ForumModerationFormComponent extends BaseFormComponent {
    public record!: ForumModerationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadForumModerationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
