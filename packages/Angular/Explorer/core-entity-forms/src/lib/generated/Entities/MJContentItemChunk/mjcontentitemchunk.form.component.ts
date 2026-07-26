import { Component } from '@angular/core';
import { MJContentItemChunkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

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
            { sectionKey: 'vectorIntegration', sectionName: 'Vector Integration', isExpanded: true },
            { sectionKey: 'lifecycleStatus', sectionName: 'Lifecycle Status', isExpanded: true },
            { sectionKey: 'lifecycleTimestamps', sectionName: 'Lifecycle Timestamps', isExpanded: true },
            { sectionKey: 'provenanceAndPositioning', sectionName: 'Provenance and Positioning', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJContentItemChunks', sectionName: 'Content Item Chunks', isExpanded: false }
        ]);
    }
}

