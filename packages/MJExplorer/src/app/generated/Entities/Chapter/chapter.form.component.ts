import { Component } from '@angular/core';
import { ChapterEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Chapters') // Tell MemberJunction about this class
@Component({
    selector: 'gen-chapter-form',
    templateUrl: './chapter.form.component.html'
})
export class ChapterFormComponent extends BaseFormComponent {
    public record!: ChapterEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'chapterMemberships', sectionName: 'Chapter Memberships', isExpanded: false },
            { sectionKey: 'chapterOfficers', sectionName: 'Chapter Officers', isExpanded: false }
        ]);
    }
}

export function LoadChapterFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
