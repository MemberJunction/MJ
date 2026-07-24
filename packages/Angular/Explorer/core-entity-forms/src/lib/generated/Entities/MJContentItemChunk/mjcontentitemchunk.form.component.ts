import { Component } from '@angular/core';
import { MJContentItemChunkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Content Item Chunks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentitemchunk-form',
    templateUrl: './mjcontentitemchunk.form.component.html'
})
export class MJContentItemChunkFormComponent extends BaseFormComponent {
    public record!: MJContentItemChunkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'chunkDetails', sectionName: 'Chunk Details', isExpanded: true },
            { sectionKey: 'chunkContent', sectionName: 'Chunk Content', isExpanded: true },
            { sectionKey: 'vectorInformation', sectionName: 'Vector Information', isExpanded: true },
            { sectionKey: 'lifecycleStatus', sectionName: 'Lifecycle Status', isExpanded: true },
            { sectionKey: 'lifecycleTimestamps', sectionName: 'Lifecycle Timestamps', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

