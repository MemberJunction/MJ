import { Component } from '@angular/core';
import { SongJournalEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Song Journals') // Tell MemberJunction about this class
@Component({
    selector: 'gen-songjournal-form',
    templateUrl: './songjournal.form.component.html'
})
export class SongJournalFormComponent extends BaseFormComponent {
    public record!: SongJournalEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associations', sectionName: 'Associations', isExpanded: true },
            { sectionKey: 'entryDetails', sectionName: 'Entry Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadSongJournalFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
