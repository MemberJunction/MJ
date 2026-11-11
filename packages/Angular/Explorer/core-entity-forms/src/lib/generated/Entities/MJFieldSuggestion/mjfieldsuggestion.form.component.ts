import { Component } from '@angular/core';
import { MJFieldSuggestionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Field Suggestions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjfieldsuggestion-form',
    templateUrl: './mjfieldsuggestion.form.component.html'
})
export class MJFieldSuggestionFormComponent extends BaseFormComponent {
    public record!: MJFieldSuggestionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'suggestionDetails', sectionName: 'Suggestion Details', isExpanded: true },
            { sectionKey: 'commentDetails', sectionName: 'Comment Details', isExpanded: true },
            { sectionKey: 'conversationDetails', sectionName: 'Conversation Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

