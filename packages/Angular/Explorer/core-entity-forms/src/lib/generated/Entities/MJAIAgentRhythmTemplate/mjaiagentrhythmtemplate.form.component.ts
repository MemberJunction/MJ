import { Component } from '@angular/core';
import { MJAIAgentRhythmTemplateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Rhythm Templates') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentrhythmtemplate-form',
    templateUrl: './mjaiagentrhythmtemplate.form.component.html'
})
export class MJAIAgentRhythmTemplateFormComponent extends BaseFormComponent {
    public record!: MJAIAgentRhythmTemplateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

