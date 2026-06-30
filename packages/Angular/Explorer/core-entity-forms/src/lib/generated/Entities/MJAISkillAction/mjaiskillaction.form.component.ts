import { Component } from '@angular/core';
import { MJAISkillActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Skill Actions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiskillaction-form',
    templateUrl: './mjaiskillaction.form.component.html'
})
export class MJAISkillActionFormComponent extends BaseFormComponent {
    public record!: MJAISkillActionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'mappingDetails', sectionName: 'Mapping Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

