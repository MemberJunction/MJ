import { Component } from '@angular/core';
import { MJAIAgentPromptsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Prompts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentprompts-form',
    templateUrl: './mjaiagentprompts.form.component.html'
})
export class MJAIAgentPromptsFormComponent extends BaseFormComponent {
    public record!: MJAIAgentPromptsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'technicalIdentification', sectionName: 'Technical Identification', isExpanded: true },
            { sectionKey: 'executionConfiguration', sectionName: 'Execution Configuration', isExpanded: true },
            { sectionKey: 'descriptiveLabels', sectionName: 'Descriptive Labels', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

