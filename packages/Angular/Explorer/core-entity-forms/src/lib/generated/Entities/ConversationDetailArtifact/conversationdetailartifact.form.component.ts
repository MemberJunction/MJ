import { Component } from '@angular/core';
import { ConversationDetailArtifactEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Conversation Detail Artifacts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-conversationdetailartifact-form',
    templateUrl: './conversationdetailartifact.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ConversationDetailArtifactFormComponent extends BaseFormComponent {
    public record!: ConversationDetailArtifactEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadConversationDetailArtifactFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
