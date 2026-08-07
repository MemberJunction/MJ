import { Component } from '@angular/core';
import { MJMaterializedResultEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Materialized Results') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmaterializedresult-form',
    templateUrl: './mjmaterializedresult.form.component.html'
})
export class MJMaterializedResultFormComponent extends BaseFormComponent {
    public record!: MJMaterializedResultEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJQueries', sectionName: 'Queries', isExpanded: false }
        ]);
    }
}

