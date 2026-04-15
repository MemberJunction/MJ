import { Component } from '@angular/core';
import { MJSQLDialectEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: SQL Dialects') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsqldialect-form',
    templateUrl: './mjsqldialect.form.component.html'
})
export class MJSQLDialectFormComponent extends BaseFormComponent {
    public record!: MJSQLDialectEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'dialectInformation', sectionName: 'Dialect Information', isExpanded: true },
            { sectionKey: 'integrationResources', sectionName: 'Integration & Resources', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJQuerySQLs', sectionName: 'Query SQLs', isExpanded: false },
            { sectionKey: 'mJQueries', sectionName: 'Queries', isExpanded: false }
        ]);
    }
}

