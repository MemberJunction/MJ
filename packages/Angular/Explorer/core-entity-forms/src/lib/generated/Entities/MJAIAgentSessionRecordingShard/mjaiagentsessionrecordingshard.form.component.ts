import { Component } from '@angular/core';
import { MJAIAgentSessionRecordingShardEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Session Recording Shards') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentsessionrecordingshard-form',
    templateUrl: './mjaiagentsessionrecordingshard.form.component.html'
})
export class MJAIAgentSessionRecordingShardFormComponent extends BaseFormComponent {
    public record!: MJAIAgentSessionRecordingShardEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'sessionAssociation', sectionName: 'Session Association', isExpanded: true },
            { sectionKey: 'shardDetails', sectionName: 'Shard Details', isExpanded: true },
            { sectionKey: 'audioProperties', sectionName: 'Audio Properties', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

