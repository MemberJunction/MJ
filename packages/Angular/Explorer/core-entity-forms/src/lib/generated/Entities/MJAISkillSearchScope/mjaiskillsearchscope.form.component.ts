import { Component } from '@angular/core';
import { MJAISkillSearchScopeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Skill Search Scopes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiskillsearchscope-form',
    templateUrl: './mjaiskillsearchscope.form.component.html'
})
export class MJAISkillSearchScopeFormComponent extends BaseFormComponent {
    public record!: MJAISkillSearchScopeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

