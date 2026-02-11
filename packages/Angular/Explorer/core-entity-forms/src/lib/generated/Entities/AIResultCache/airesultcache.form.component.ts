import { Component } from '@angular/core';
import { AIResultCacheEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'AI Result Cache') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-airesultcache-form',
    templateUrl: './airesultcache.form.component.html'
})
export class AIResultCacheFormComponent extends BaseFormComponent {
    public record!: AIResultCacheEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'promptConfiguration', sectionName: 'Prompt Configuration', isExpanded: true },
            { sectionKey: 'executionDetails', sectionName: 'Execution Details', isExpanded: true },
            { sectionKey: 'resultInformation', sectionName: 'Result Information', isExpanded: false },
            { sectionKey: 'stakeholderLinks', sectionName: 'Stakeholder Links', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

