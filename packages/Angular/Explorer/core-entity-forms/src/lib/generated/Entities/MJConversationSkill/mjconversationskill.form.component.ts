import { Component } from '@angular/core';
import { MJConversationSkillEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Conversation Skills') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjconversationskill-form',
    templateUrl: './mjconversationskill.form.component.html'
})
export class MJConversationSkillFormComponent extends BaseFormComponent {
    public record!: MJConversationSkillEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'conversationDetails', sectionName: 'Conversation Details', isExpanded: true },
            { sectionKey: 'skillInformation', sectionName: 'Skill Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

