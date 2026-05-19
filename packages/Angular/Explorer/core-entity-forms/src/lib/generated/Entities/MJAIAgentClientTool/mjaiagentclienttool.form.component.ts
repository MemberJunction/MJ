import { Component } from '@angular/core';
import { MJAIAgentClientToolEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Client Tools') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentclienttool-form',
    templateUrl: './mjaiagentclienttool.form.component.html'
})
export class MJAIAgentClientToolFormComponent extends BaseFormComponent {
    public record!: MJAIAgentClientToolEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'toolAssignment', sectionName: 'Tool Assignment', isExpanded: true },
            { sectionKey: 'executionSettings', sectionName: 'Execution Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

