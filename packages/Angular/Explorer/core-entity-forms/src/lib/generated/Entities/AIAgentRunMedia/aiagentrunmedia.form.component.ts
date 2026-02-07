import { Component } from '@angular/core';
import { AIAgentRunMediaEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Run Medias') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aiagentrunmedia-form',
    templateUrl: './aiagentrunmedia.form.component.html'
})
export class AIAgentRunMediaFormComponent extends BaseFormComponent {
    public record!: AIAgentRunMediaEntity;

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

export function LoadAIAgentRunMediaFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
