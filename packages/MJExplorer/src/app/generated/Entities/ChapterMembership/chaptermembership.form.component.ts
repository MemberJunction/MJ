import { Component } from '@angular/core';
import { ChapterMembershipEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Chapter Memberships') // Tell MemberJunction about this class
@Component({
    selector: 'gen-chaptermembership-form',
    templateUrl: './chaptermembership.form.component.html'
})
export class ChapterMembershipFormComponent extends BaseFormComponent {
    public record!: ChapterMembershipEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadChapterMembershipFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
