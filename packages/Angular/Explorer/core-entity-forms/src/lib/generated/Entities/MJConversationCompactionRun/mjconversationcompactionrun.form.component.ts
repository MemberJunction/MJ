import { Component } from '@angular/core';
import { MJConversationCompactionRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Conversation Compaction Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjconversationcompactionrun-form',
    templateUrl: './mjconversationcompactionrun.form.component.html'
})
export class MJConversationCompactionRunFormComponent extends BaseFormComponent {
    public record!: MJConversationCompactionRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationshipMapping', sectionName: 'Relationship Mapping', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

