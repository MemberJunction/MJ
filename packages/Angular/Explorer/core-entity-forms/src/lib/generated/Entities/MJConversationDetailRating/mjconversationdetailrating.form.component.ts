import { Component } from '@angular/core';
import { MJConversationDetailRatingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Conversation Detail Ratings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjconversationdetailrating-form',
    templateUrl: './mjconversationdetailrating.form.component.html'
})
export class MJConversationDetailRatingFormComponent extends BaseFormComponent {
    public record!: MJConversationDetailRatingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'referenceIDs', sectionName: 'Reference IDs', isExpanded: true },
            { sectionKey: 'ratingInformation', sectionName: 'Rating Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

