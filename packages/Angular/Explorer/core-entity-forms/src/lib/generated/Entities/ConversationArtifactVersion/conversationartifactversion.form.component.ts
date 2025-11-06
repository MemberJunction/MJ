import { Component } from '@angular/core';
import { ConversationArtifactVersionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Conversation Artifact Versions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-conversationartifactversion-form',
    templateUrl: './conversationartifactversion.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ConversationArtifactVersionFormComponent extends BaseFormComponent {
    public record!: ConversationArtifactVersionEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        conversationDetails: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadConversationArtifactVersionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
