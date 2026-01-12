import { Component } from '@angular/core';
import { ChapterOfficerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Chapter Officers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-chapterofficer-form',
    templateUrl: './chapterofficer.form.component.html'
})
export class ChapterOfficerFormComponent extends BaseFormComponent {
    public record!: ChapterOfficerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'assignmentTimeline', sectionName: 'Assignment & Timeline', isExpanded: true },
            { sectionKey: 'officerInformation', sectionName: 'Officer Information', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadChapterOfficerFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
