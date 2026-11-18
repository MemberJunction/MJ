import { Component } from '@angular/core';
import { MJCommentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Comments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcomment-form',
    templateUrl: './mjcomment.form.component.html'
})
export class MJCommentFormComponent extends BaseFormComponent {
    public record!: MJCommentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'commentDetails', sectionName: 'Comment Details', isExpanded: true },
            { sectionKey: 'conversationDetails', sectionName: 'Conversation Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

