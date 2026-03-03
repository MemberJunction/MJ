import { Component } from '@angular/core';
import { MJQueryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Queries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjquery-form',
    templateUrl: './mjquery.form.component.html'
})
export class MJQueryFormComponent extends BaseFormComponent {
    public record!: MJQueryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'queryDefinition', sectionName: 'Query Definition', isExpanded: true },
            { sectionKey: 'performanceQuality', sectionName: 'Performance & Quality', isExpanded: true },
            { sectionKey: 'cachingExecutionSettings', sectionName: 'Caching & Execution Settings', isExpanded: false },
            { sectionKey: 'aIEmbeddings', sectionName: 'AI & Embeddings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJDataContextItems', sectionName: 'Data Context Items', isExpanded: false },
            { sectionKey: 'mJQueryFields', sectionName: 'Query Fields', isExpanded: false },
            { sectionKey: 'mJQueryPermissions', sectionName: 'Query Permissions', isExpanded: false },
            { sectionKey: 'mJQueryParameters', sectionName: 'Query Parameters', isExpanded: false },
            { sectionKey: 'mJQueryEntities', sectionName: 'Query Entities', isExpanded: false },
            { sectionKey: 'mJQuerySQLs', sectionName: 'Query SQLs', isExpanded: false }
        ]);
    }
}

