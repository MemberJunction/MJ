import { Component } from '@angular/core';
import { MJSearchScopeEntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Search Scope Entities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsearchscopeentity-form',
    templateUrl: './mjsearchscopeentity.form.component.html'
})
export class MJSearchScopeEntityFormComponent extends BaseFormComponent {
    public record!: MJSearchScopeEntityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'searchConfiguration', sectionName: 'Search Configuration', isExpanded: true },
            { sectionKey: 'queryOverrides', sectionName: 'Query Overrides', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

