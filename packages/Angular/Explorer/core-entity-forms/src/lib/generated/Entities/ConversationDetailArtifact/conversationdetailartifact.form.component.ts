import { Component } from '@angular/core';
import { ConversationDetailArtifactEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Conversation Detail Artifacts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-conversationdetailartifact-form',
    templateUrl: './conversationdetailartifact.form.component.html'
})
export class ConversationDetailArtifactFormComponent extends BaseFormComponent {
    public record!: ConversationDetailArtifactEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'coreIdentifiers', sectionName: 'Core Identifiers', isExpanded: true },
            { sectionKey: 'artifactDetails', sectionName: 'Artifact Details', isExpanded: true },
            { sectionKey: 'messageContent', sectionName: 'Message Content', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

