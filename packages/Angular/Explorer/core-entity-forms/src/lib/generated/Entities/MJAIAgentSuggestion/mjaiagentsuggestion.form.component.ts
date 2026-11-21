import { Component } from '@angular/core';
import { MJAIAgentSuggestionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Suggestions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentsuggestion-form',
    templateUrl: './mjaiagentsuggestion.form.component.html'
})
export class MJAIAgentSuggestionFormComponent extends BaseFormComponent {
    public record!: MJAIAgentSuggestionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

