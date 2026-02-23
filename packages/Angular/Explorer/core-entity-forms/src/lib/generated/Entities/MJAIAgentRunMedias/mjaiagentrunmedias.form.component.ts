import { Component } from '@angular/core';
import { MJAIAgentRunMediasEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Run Medias') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentrunmedias-form',
    templateUrl: './mjaiagentrunmedias.form.component.html'
})
export class MJAIAgentRunMediasFormComponent extends BaseFormComponent {
    public record!: MJAIAgentRunMediasEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runContext', sectionName: 'Run Context', isExpanded: true },
            { sectionKey: 'fileAttributes', sectionName: 'File Attributes', isExpanded: true },
            { sectionKey: 'mediaContent', sectionName: 'Media Content', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

