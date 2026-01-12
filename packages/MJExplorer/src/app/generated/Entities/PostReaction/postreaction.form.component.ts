import { Component } from '@angular/core';
import { PostReactionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Post Reactions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-postreaction-form',
    templateUrl: './postreaction.form.component.html'
})
export class PostReactionFormComponent extends BaseFormComponent {
    public record!: PostReactionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associations', sectionName: 'Associations', isExpanded: true },
            { sectionKey: 'reactionDetails', sectionName: 'Reaction Details', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadPostReactionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
