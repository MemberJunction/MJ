import { Component } from '@angular/core';
import { MJAISkillFileEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Skill Files') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiskillfile-form',
    templateUrl: './mjaiskillfile.form.component.html'
})
export class MJAISkillFileFormComponent extends BaseFormComponent {
    public record!: MJAISkillFileEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

