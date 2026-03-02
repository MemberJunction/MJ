import { Component } from '@angular/core';
import { MJQuerySQLEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Query SQLs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjquerysql-form',
    templateUrl: './mjquerysql.form.component.html'
})
export class MJQuerySQLFormComponent extends BaseFormComponent {
    public record!: MJQuerySQLEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'queryContext', sectionName: 'Query Context', isExpanded: true },
            { sectionKey: 'sQLDefinition', sectionName: 'SQL Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

