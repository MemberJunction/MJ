import { Component } from '@angular/core';
import { MJConversationDetailRatingsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Conversation Detail Ratings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjconversationdetailratings-form',
    templateUrl: './mjconversationdetailratings.form.component.html'
})
export class MJConversationDetailRatingsFormComponent extends BaseFormComponent {
    public record!: MJConversationDetailRatingsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'referenceIDs', sectionName: 'Reference IDs', isExpanded: true },
            { sectionKey: 'ratingInformation', sectionName: 'Rating Information', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

