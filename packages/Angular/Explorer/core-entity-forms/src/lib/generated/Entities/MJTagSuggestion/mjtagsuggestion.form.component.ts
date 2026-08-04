import { Component } from '@angular/core';
import { MJTagSuggestionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Tag Suggestions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtagsuggestion-form',
    templateUrl: './mjtagsuggestion.form.component.html'
})
export class MJTagSuggestionFormComponent extends BaseFormComponent {
    public record!: MJTagSuggestionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'suggestionDetails', sectionName: 'Suggestion Details', isExpanded: true },
            { sectionKey: 'matchingAnalysis', sectionName: 'Matching Analysis', isExpanded: true },
            { sectionKey: 'sourceContext', sectionName: 'Source Context', isExpanded: true },
            { sectionKey: 'reviewWorkflow', sectionName: 'Review Workflow', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

