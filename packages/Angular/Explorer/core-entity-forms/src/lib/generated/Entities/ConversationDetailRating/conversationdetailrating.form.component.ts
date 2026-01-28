import { Component } from '@angular/core';
import { ConversationDetailRatingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Conversation Detail Ratings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-conversationdetailrating-form',
    templateUrl: './conversationdetailrating.form.component.html'
})
export class ConversationDetailRatingFormComponent extends BaseFormComponent {
    public record!: ConversationDetailRatingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'referenceIDs', sectionName: 'Reference IDs', isExpanded: true },
            { sectionKey: 'ratingInformation', sectionName: 'Rating Information', isExpanded: true },
            { sectionKey: 'conversationContent', sectionName: 'Conversation Content', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadConversationDetailRatingFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
