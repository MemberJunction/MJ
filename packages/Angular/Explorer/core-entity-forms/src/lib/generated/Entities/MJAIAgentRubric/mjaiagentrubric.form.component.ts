import { Component } from '@angular/core';
import { MJAIAgentRubricEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Rubrics') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentrubric-form',
    templateUrl: './mjaiagentrubric.form.component.html'
})
export class MJAIAgentRubricFormComponent extends BaseFormComponent {
    public record!: MJAIAgentRubricEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

