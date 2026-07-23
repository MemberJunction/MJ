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
            { sectionKey: 'contentAssociation', sectionName: 'Content Association', isExpanded: true },
            { sectionKey: 'chunkDetails', sectionName: 'Chunk Details', isExpanded: true },
            { sectionKey: 'vectorIntegration', sectionName: 'Vector Integration', isExpanded: true },
            { sectionKey: 'processingStatus', sectionName: 'Processing Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

