import { Component } from '@angular/core';
import { MJTagCoOccurrenceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Tag Co Occurrences') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtagcooccurrence-form',
    templateUrl: './mjtagcooccurrence.form.component.html'
})
export class MJTagCoOccurrenceFormComponent extends BaseFormComponent {
    public record!: MJTagCoOccurrenceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tagPairInformation', sectionName: 'Tag Pair Information', isExpanded: true },
            { sectionKey: 'coOccurrenceMetrics', sectionName: 'Co-Occurrence Metrics', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

