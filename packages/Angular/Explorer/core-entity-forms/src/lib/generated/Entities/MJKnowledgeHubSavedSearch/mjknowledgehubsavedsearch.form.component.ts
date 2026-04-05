import { Component } from '@angular/core';
import { MJKnowledgeHubSavedSearchEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Knowledge Hub Saved Searches') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjknowledgehubsavedsearch-form',
    templateUrl: './mjknowledgehubsavedsearch.form.component.html'
})
export class MJKnowledgeHubSavedSearchFormComponent extends BaseFormComponent {
    public record!: MJKnowledgeHubSavedSearchEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'searchDefinition', sectionName: 'Search Definition', isExpanded: true },
            { sectionKey: 'searchSettings', sectionName: 'Search Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

