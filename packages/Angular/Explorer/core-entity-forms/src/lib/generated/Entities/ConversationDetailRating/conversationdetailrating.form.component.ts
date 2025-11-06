import { Component } from '@angular/core';
import { ConversationDetailRatingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Conversation Detail Ratings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-conversationdetailrating-form',
    templateUrl: './conversationdetailrating.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ConversationDetailRatingFormComponent extends BaseFormComponent {
    public record!: ConversationDetailRatingEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadConversationDetailRatingFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
