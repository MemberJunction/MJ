import { Component } from '@angular/core';
import { MJConversationDetailArtifactEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Conversation Detail Artifacts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjconversationdetailartifact-form',
    templateUrl: './mjconversationdetailartifact.form.component.html'
})
export class MJConversationDetailArtifactFormComponent extends BaseFormComponent {
    public record!: MJConversationDetailArtifactEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'coreIdentifiers', sectionName: 'Core Identifiers', isExpanded: true },
            { sectionKey: 'artifactDetails', sectionName: 'Artifact Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

