import { Component } from '@angular/core';
import { MJQueriesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Queries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjqueries-form',
    templateUrl: './mjqueries.form.component.html'
})
export class MJQueriesFormComponent extends BaseFormComponent {
    public record!: MJQueriesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'queryDefinition', sectionName: 'Query Definition', isExpanded: true },
            { sectionKey: 'performanceQuality', sectionName: 'Performance & Quality', isExpanded: true },
            { sectionKey: 'cachingExecutionSettings', sectionName: 'Caching & Execution Settings', isExpanded: false },
            { sectionKey: 'aIEmbeddings', sectionName: 'AI & Embeddings', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'dataContextItems', sectionName: 'Data Context Items', isExpanded: false },
            { sectionKey: 'queryFields', sectionName: 'Query Fields', isExpanded: false },
            { sectionKey: 'queryPermissions', sectionName: 'Query Permissions', isExpanded: false },
            { sectionKey: 'mJQueryParameters', sectionName: 'MJ: Query Parameters', isExpanded: false },
            { sectionKey: 'queryEntities', sectionName: 'Query Entities', isExpanded: false }
        ]);
    }
}

