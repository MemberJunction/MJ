import { Component } from '@angular/core';
import { MJSearchScopeGraphEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Search Scope Graphs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsearchscopegraph-form',
    templateUrl: './mjsearchscopegraph.form.component.html'
})
export class MJSearchScopeGraphFormComponent extends BaseFormComponent {
    public record!: MJSearchScopeGraphEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'scopeAndGraph', sectionName: 'Scope and Graph', isExpanded: true },
            { sectionKey: 'retrievalConfiguration', sectionName: 'Retrieval Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

