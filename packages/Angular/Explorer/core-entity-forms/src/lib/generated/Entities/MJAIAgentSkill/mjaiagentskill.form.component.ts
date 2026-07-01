import { Component } from '@angular/core';
import { MJAIAgentSkillEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Skills') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentskill-form',
    templateUrl: './mjaiagentskill.form.component.html'
})
export class MJAIAgentSkillFormComponent extends BaseFormComponent {
    public record!: MJAIAgentSkillEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'assignmentDetails', sectionName: 'Assignment Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

