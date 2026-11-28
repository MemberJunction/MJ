import { Component } from '@angular/core';
import { MJAIAgentNoteSourceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Note Sources') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentnotesource-form',
    templateUrl: './mjaiagentnotesource.form.component.html'
})
export class MJAIAgentNoteSourceFormComponent extends BaseFormComponent {
    public record!: MJAIAgentNoteSourceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'lineageDetails', sectionName: 'Lineage Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

