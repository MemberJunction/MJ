import { Component } from '@angular/core';
import { MJSearchScopeTestQueryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Search Scope Test Queries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsearchscopetestquery-form',
    templateUrl: './mjsearchscopetestquery.form.component.html'
})
export class MJSearchScopeTestQueryFormComponent extends BaseFormComponent {
    public record!: MJSearchScopeTestQueryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'searchConfiguration', sectionName: 'Search Configuration', isExpanded: true },
            { sectionKey: 'queryDefinition', sectionName: 'Query Definition', isExpanded: true },
            { sectionKey: 'validationCriteria', sectionName: 'Validation Criteria', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

